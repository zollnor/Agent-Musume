param([int]$OwnerPid,[switch]$ClassifyOnly,[string]$Source,[string]$CommandLine)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
# The watcher runs in C#: listing processes through WMI every second cost a tenth of a core. It lists PID, parent PID,
# start order and image name fifty times a second (a few hundredths of a millisecond each on Windows 10 2004 and later),
# reads a command line once, only for a new process that may be a harness, and keeps exited processes for two minutes,
# so a task started in the background (Start-Process, a detached spawn) still leads back to the harness that ran it.
# startedAt is a start order compared and matched by the host, never read as a time: the kernel's process sequence
# number, or the creation time where that list is not available.
if (-not ('AgentMusumeHarnessWatcher' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
public static class AgentMusumeHarnessWatcher {
  [DllImport("ntdll.dll")] static extern int NtQuerySystemInformation(int infoClass, IntPtr buffer, int length, out int needed);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr process, int infoClass, IntPtr buffer, int length, out int needed);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern int WaitForSingleObject(IntPtr handle, int milliseconds);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr handle, out int code);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageNameW(IntPtr process, int flags, StringBuilder name, ref int size);
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CommandLineToArgvW(string command, out int count);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
  const int QueryLimited = 0x1000, Synchronize = 0x100000;
  class Proc { public long Pid, Parent, Order, LastSeen; public string Source, Mode = "interactive", Relay, Image; public bool Bridge, Wait; public IntPtr Handle = IntPtr.Zero; }

  static readonly string[] Metadata = { "--version", "--help", "-v", "-h" };
  static readonly string[] MetadataCommands = { "auth", "login", "logout", "mcp", "plugin", "plugins", "doctor", "update", "install", "completion", "completions", "app-server", "exec-server" };
  static readonly string[] TakesValue = { "--model", "-m", "--profile", "-p", "--config", "-c", "--sandbox", "-s", "--ask-for-approval", "-a", "--cd", "-C", "--add-dir", "--enable", "--disable", "--image", "-i" };
  static readonly Regex ClaudeScript = new Regex(@"[/\\]@anthropic-ai[/\\]claude-code[/\\].*\.(?:js|mjs)(?:""|\s|$)", RegexOptions.IgnoreCase);
  static readonly Regex HandoffScript = new Regex(@"[/\\]handoff\.mjs(?:""|\s|$)", RegexOptions.IgnoreCase);
  static readonly Regex DesktopImage = new Regex(@"OpenAI", RegexOptions.IgnoreCase); // the Store package (OpenAI.Codex) or another OpenAI install
  static readonly Regex DshName = new Regex(@"^(?:dsh|deepseek[- ]harness)\.exe$", RegexOptions.IgnoreCase);
  static readonly Regex BridgeName = new Regex(@"^(?:node|electron|agent-musume)\.exe$", RegexOptions.IgnoreCase);
  static readonly Regex TerminalName = new Regex(@"^wezterm\.exe$", RegexOptions.IgnoreCase);
  static readonly Regex Candidate = new Regex(@"^(?:claude|codex|node|electron|agent-musume|chatgpt|dsh|deepseek[- ]harness|herdr|wezterm)\.exe$", RegexOptions.IgnoreCase);
  static bool In(string[] list, string token) { foreach (var item in list) if (string.Equals(item, token, StringComparison.OrdinalIgnoreCase)) return true; return false; }
  static bool Is(string name, string expected) { return string.Equals(name, expected, StringComparison.OrdinalIgnoreCase); }

  // The arguments after the program, as Windows splits them; null when the line cannot be split.
  static List<string> Tokens(string command) {
    int count; IntPtr memory = CommandLineToArgvW(command, out count);
    if (memory == IntPtr.Zero) return null;
    var tokens = new List<string>();
    try { for (int i = 1; i < count; i++) tokens.Add(Marshal.PtrToStringUni(Marshal.ReadIntPtr(memory, i * IntPtr.Size))); }
    finally { LocalFree(memory); }
    return tokens;
  }

  // { source, mode }: a CLI task (claude -p, codex exec), an interactive session, or a metadata command (no source).
  public static string[] Classify(string source, string command, bool nodeScript) {
    var tokens = Tokens(command);
    if (tokens == null) return new[] { source, "interactive" };
    if (nodeScript && tokens.Count > 0) tokens.RemoveAt(0);
    string mode = "interactive";
    for (int i = 0; i < tokens.Count; i++) {
      string token = tokens[i];
      if (token == "--") break;
      if (In(Metadata, token)) return new string[] { null, "metadata" };
      if (source == "claude-code") {
        if (Is(token, "-p") || Is(token, "--print")) { mode = "cli-task"; break; }
        if (i == 0 && In(MetadataCommands, token)) return new string[] { null, "metadata" };
      } else if (source == "codex-cli") {
        if (token.StartsWith("--__codex", StringComparison.Ordinal)) return new string[] { null, "metadata" }; // a sandbox helper, e.g. --__codex-windows-mxc
        if (token.StartsWith("-")) { if (In(TakesValue, token)) i++; continue; }
        if (Is(token, "exec") || Is(token, "e")) mode = "cli-task";
        else if (In(MetadataCommands, token)) return new string[] { null, "metadata" };
        break;
      }
    }
    return new[] { source, mode };
  }

  // Commands that hand text to an agent that is already open: { mode, target, wait }, or { "other", null, "false" }.
  //   herdr agent prompt <pane> <text> [--wait]   herdr-prompt (a text starting with "/" is herdr-command: /model, /effort)
  //   herdr agent send-keys <pane> <keys...>      herdr-keys
  //   wezterm cli send-text [--pane-id <id>] [text]   term-text (target: the pane id, empty for the current one)
  //   codex queue --thread <session> --message <text>          codex-queue (target: the session id or name)
  // Of the text only the first character of a Herdr prompt is looked at, and nothing of it is kept.
  public static string[] Relay(string program, string command) {
    var tokens = Tokens(command) ?? new List<string>(); var none = new string[] { "other", null, "false" };
    Func<string, string, int> after = (first, second) => { for (int i = 0; i + 1 < tokens.Count; i++) if (Is(tokens[i], first) && Is(tokens[i + 1], second)) return i + 2; return -1; };
    if (Is(program, "herdr.exe")) {
      int at = after("agent", "prompt"), keys = after("agent", "send-keys");
      if (keys >= 0) return keys < tokens.Count ? new string[] { "herdr-keys", tokens[keys], "false" } : none;
      if (at < 0) return none;
      var positional = new List<string>(); bool wait = false;
      for (int i = at; i < tokens.Count; i++) {
        string token = tokens[i];
        if (Is(token, "--wait")) wait = true;
        else if (Is(token, "--until") || Is(token, "--timeout")) i++;
        else if (token.StartsWith("--", StringComparison.Ordinal)) continue;
        else positional.Add(token);
      }
      if (positional.Count < 2) return none;
      return new string[] { positional[1].TrimStart().StartsWith("/", StringComparison.Ordinal) ? "herdr-command" : "herdr-prompt", positional[0], wait ? "true" : "false" };
    }
    if (TerminalName.IsMatch(program)) {
      int at = after("cli", "send-text"); if (at < 0) return none;
      string pane = "";
      for (int i = at; i + 1 < tokens.Count; i++) if (Is(tokens[i], "--pane-id")) pane = tokens[i + 1];
      return new string[] { "term-text", pane, "false" };
    }
    if (Is(program, "codex.exe")) {
      int at = -1;
      for (int i = 0; i < tokens.Count; i++) { if (tokens[i].StartsWith("-")) { if (In(TakesValue, tokens[i])) i++; continue; } if (Is(tokens[i], "queue")) at = i + 1; break; }
      if (at < 0) return none;
      for (int i = at; i + 1 < tokens.Count; i++) if (Is(tokens[i], "--thread")) return new string[] { "codex-queue", tokens[i + 1], "false" };
      return none;
    }
    return none;
  }

  static string CommandLineOf(IntPtr handle) {
    int needed; IntPtr buffer = Marshal.AllocHGlobal(4096);
    try {
      int status = NtQueryInformationProcess(handle, 60, buffer, 4096, out needed); // ProcessCommandLineInformation
      if (status != 0 && needed > 4096) { Marshal.FreeHGlobal(buffer); buffer = Marshal.AllocHGlobal(needed); status = NtQueryInformationProcess(handle, 60, buffer, needed, out needed); }
      if (status != 0) return null;
      int length = Marshal.ReadInt16(buffer, 0) & 0xFFFF; IntPtr text = Marshal.ReadIntPtr(buffer, IntPtr.Size);
      return text == IntPtr.Zero ? "" : Marshal.PtrToStringUni(text, length / 2);
    } finally { Marshal.FreeHGlobal(buffer); }
  }
  static string ImageOf(IntPtr handle) { var name = new StringBuilder(1024); int size = name.Capacity; return QueryFullProcessImageNameW(handle, 0, name, ref size) ? name.ToString() : ""; }

  static void Describe(Proc p, string name) {
    IntPtr handle = OpenProcess(QueryLimited | Synchronize, false, (int)p.Pid);
    if (handle == IntPtr.Zero) return;
    string command = CommandLineOf(handle) ?? "", source = null;
    if (Is(name, "ChatGPT.exe") && DesktopImage.IsMatch(ImageOf(handle)) && command.IndexOf("--type=", StringComparison.Ordinal) < 0) source = "chatgpt-desktop";
    else if (Is(name, "codex.exe")) source = "codex-cli";
    else if (Is(name, "claude.exe") || Is(name, "node.exe") && ClaudeScript.IsMatch(command)) source = "claude-code";
    else if (DshName.IsMatch(name) && command.IndexOf("--type=", StringComparison.Ordinal) < 0) source = "dsh-desktop";
    p.Bridge = BridgeName.IsMatch(name) && HandoffScript.IsMatch(command);
    if (Is(name, "herdr.exe") || Is(name, "codex.exe") || TerminalName.IsMatch(name)) {
      var relay = Relay(name, command);
      if (relay[0] == "herdr-command") p.Mode = relay[0];
      // A hand-over through an agent that is already open: kept with its handle, for the exit code.
      if (relay[0] != "other" && relay[0] != "herdr-command") { p.Mode = relay[0]; p.Relay = relay[1] ?? ""; p.Wait = relay[2] == "true"; p.Image = ImageOf(handle); p.Handle = handle; return; }
    }
    if (source == "chatgpt-desktop" || source == "dsh-desktop") { p.Source = source; p.Mode = "gui"; }
    else if (source != null) { var info = Classify(source, command, Is(name, "node.exe")); p.Source = info[0]; p.Mode = info[1]; }
    // A harness keeps its handle so that its real exit code is still there after it exits.
    if (p.Source != null) p.Handle = handle; else CloseHandle(handle);
  }

  // WezTerm under another file name is a terminal too: its version resource still names the product. Checked once per
  // program file.
  static readonly Dictionary<string, bool> wezterm = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
  static bool IsWezTerm(long pid) {
    IntPtr handle = OpenProcess(QueryLimited, false, (int)pid);
    if (handle == IntPtr.Zero) return false;
    try {
      string image = ImageOf(handle); bool known;
      if (image == "") return false;
      if (!wezterm.TryGetValue(image, out known)) {
        try { known = string.Equals(FileVersionInfo.GetVersionInfo(image).ProductName, "WezTerm", StringComparison.OrdinalIgnoreCase); } catch { known = false; }
        wezterm[image] = known;
      }
      return known;
    } finally { CloseHandle(handle); }
  }

  static IntPtr list = IntPtr.Zero; static int size = 1 << 18; static bool basic = true, fresh;
  // Marks every running process as seen now; a process met for the first time is added, with its image name read once.
  // The basic list (SYSTEM_BASICPROCESS_INFORMATION) gives the sequence number, unique for the whole boot; the full list
  // (SYSTEM_PROCESS_INFORMATION) the creation time, which is paired with the PID.
  static bool Poll(Dictionary<long, Proc> known, long now) {
    int pointer = IntPtr.Size;
    for (int attempt = 0; attempt < 6; attempt++) {
      if (list == IntPtr.Zero) list = Marshal.AllocHGlobal(size);
      int needed, status = NtQuerySystemInformation(basic ? 252 : 5, list, size, out needed);
      if (status == unchecked((int)0xC0000004)) { Marshal.FreeHGlobal(list); list = IntPtr.Zero; size = Math.Max(needed, size * 2) + 65536; continue; }
      if (status != 0) { if (basic) { basic = false; continue; } return false; }
      int pidAt = basic ? pointer : pointer == 8 ? 80 : 68, parentAt = pidAt + pointer, orderAt = basic ? (pointer == 8 ? 24 : 16) : 32, nameAt = basic ? orderAt + 8 : 56;
      for (long offset = 0; ; ) {
        IntPtr entry = new IntPtr(list.ToInt64() + offset);
        long pid = Marshal.ReadIntPtr(entry, pidAt).ToInt64();
        if (pid != 0) {
          long order = Marshal.ReadInt64(entry, orderAt); if (!basic) order = (order - 116444736000000000L) / 10000;
          long key = basic ? order : order * 1048576 + (pid & 0xFFFFF); Proc p;
          if (!known.TryGetValue(key, out p)) {
            known[key] = p = new Proc { Pid = pid, Parent = Marshal.ReadIntPtr(entry, parentAt).ToInt64(), Order = order };
            int length = Marshal.ReadInt16(entry, nameAt) & 0xFFFF; IntPtr text = Marshal.ReadIntPtr(entry, nameAt + pointer);
            string name = text == IntPtr.Zero ? "" : Marshal.PtrToStringUni(text, length / 2);
            if (Candidate.IsMatch(name) || IsWezTerm(pid)) { Describe(p, Candidate.IsMatch(name) ? name : "wezterm.exe"); if (p.Mode == "cli-task" || p.Relay != null) fresh = true; }
          }
          p.LastSeen = now;
        }
        int next = Marshal.ReadInt32(entry, 0); if (next == 0) break; offset += next;
      }
      return true;
    }
    return false;
  }

  static string Json(string value) {
    var text = new StringBuilder("\"");
    foreach (char c in value ?? "") { if (c == '"' || c == '\\') text.Append('\\').Append(c); else if (c < ' ') text.Append("\\u").Append(((int)c).ToString("x4")); else text.Append(c); }
    return text.Append('"').ToString();
  }

  // A starter such as "cmd /c start" lives a few tens of milliseconds, so the list is read fifty times a second; that
  // costs well under a percent of one core. Snapshots go out once a second, and at once when a task appears, so that
  // the host sees a short one (a Herdr prompt without --wait lives a fraction of a second) before its exit.
  public static void Run(int ownerPid) {
    IntPtr owner = OpenProcess(Synchronize, false, ownerPid);
    if (owner == IntPtr.Zero) return;
    var known = new Dictionary<long, Proc>(); var output = Console.Out; long lastSnapshot = 0;
    while (WaitForSingleObject(owner, 0) != 0) {
      try {
        long now = DateTime.UtcNow.Ticks / 10000;
        if (!Poll(known, now)) { output.WriteLine("{\"type\":\"unavailable\"}"); output.Flush(); Thread.Sleep(1000); continue; }
        if (fresh || now - lastSnapshot >= 1000) {
          fresh = false; lastSnapshot = now; var forget = new List<long>();
          var json = new StringBuilder("{\"type\":\"snapshot\",\"rows\":["); bool first = true;
          foreach (var pair in known) {
            Proc p = pair.Value;
            if (now - p.LastSeen > 120000) { forget.Add(pair.Key); continue; }
            if (!first) json.Append(','); first = false;
            json.Append("{\"pid\":").Append(p.Pid).Append(",\"parentPid\":").Append(p.Parent).Append(",\"startedAt\":").Append(p.Order)
              .Append(",\"source\":").Append(p.Source == null ? "null" : "\"" + p.Source + "\"").Append(",\"bridge\":").Append(p.Bridge ? "true" : "false")
              .Append(",\"mode\":\"").Append(p.LastSeen == now ? p.Mode : "gone").Append('"');
            if (p.Relay != null) json.Append(",\"relay\":{\"target\":").Append(Json(p.Relay)).Append(",\"wait\":").Append(p.Wait ? "true" : "false").Append(",\"image\":").Append(Json(p.Image)).Append('}');
            json.Append('}');
          }
          foreach (var key in forget) { if (known[key].Handle != IntPtr.Zero) CloseHandle(known[key].Handle); known.Remove(key); }
          output.WriteLine(json.Append("]}").ToString()); output.Flush();
        }
        foreach (var p in known.Values) {
          if (p.Handle == IntPtr.Zero || WaitForSingleObject(p.Handle, 0) != 0) continue;
          int code; string exit = GetExitCodeProcess(p.Handle, out code) ? code.ToString() : "null";
          output.WriteLine("{\"type\":\"exit\",\"pid\":" + p.Pid + ",\"startedAt\":" + p.Order + ",\"exitCode\":" + exit + "}"); output.Flush();
          CloseHandle(p.Handle); p.Handle = IntPtr.Zero;
        }
      } catch { output.WriteLine("{\"type\":\"unavailable\"}"); output.Flush(); }
      Thread.Sleep(20);
    }
    foreach (var p in known.Values) if (p.Handle != IntPtr.Zero) CloseHandle(p.Handle);
  }
}
'@
}
if ($ClassifyOnly -and $Source -like 'relay:*') {
  $info = [AgentMusumeHarnessWatcher]::Relay($Source.Substring(6),$CommandLine)
  @{mode=$info[0];target=$info[1];wait=$info[2] -eq 'true'} | ConvertTo-Json -Compress; return
}
if ($ClassifyOnly) {
  $info = [AgentMusumeHarnessWatcher]::Classify($Source,$CommandLine,$false)
  @{source=$info[0];mode=$info[1]} | ConvertTo-Json -Compress; return
}
[AgentMusumeHarnessWatcher]::Run($OwnerPid)
