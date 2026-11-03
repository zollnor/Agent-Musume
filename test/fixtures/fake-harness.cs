// Stand-in processes for hand-over verification (test/interaction-verification.mjs relay). They never contact a model.
// Copied under a harness's name, the program plays that harness or command:
//   <ms> <code> [--spawn <exe> <args...>]      a harness that runs a command, waits for it and exits with <code>
//   cli send-text ...                          WezTerm typing into a pane (its product name says WezTerm, see below)
//   queue ...                                  codex queue
//   agent get <pane>                           Herdr: a Claude agent whose state is in state.txt next to the program
//   agent send-keys <pane> <keys...>           Herdr: Enter sets the agent working, then idle again after 9 s
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;

// Like WezTerm's own, so that a copy under another file name is still recognised as the terminal.
[assembly: System.Reflection.AssemblyProduct("WezTerm")]

class FakeHarness {
  static string State { get { return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "state.txt"); } }
  static string Quote(string s) { return s.Length > 0 && s.IndexOfAny(new[] { ' ', '"' }) < 0 ? s : "\"" + s.Replace("\"", "\\\"") + "\""; }
  static int Main(string[] a) {
    if (a.Length >= 2 && a[0] == "cli" && a[1] == "send-text") return 0;
    if (a.Length >= 1 && a[0] == "queue") return 0;
    if (a.Length >= 3 && a[0] == "agent" && a[1] == "get") {
      string status = File.Exists(State) ? File.ReadAllText(State).Trim() : "idle";
      Console.WriteLine("{\"result\":{\"agent\":{\"agent\":\"claude\",\"agent_status\":\"" + status + "\",\"agent_session\":{\"agent\":\"claude\",\"value\":\"qa-session\"},\"pane_id\":\"" + a[2] + "\"},\"type\":\"agent_info\"}}");
      return 0;
    }
    if (a.Length >= 3 && a[0] == "agent" && a[1] == "send-keys") {
      if (a.Skip(3).Any(k => k.Equals("Enter", StringComparison.OrdinalIgnoreCase))) {
        File.WriteAllText(State, "working");
        Process.Start(new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName, "finish 9000") { UseShellExecute = false, CreateNoWindow = true });
      }
      return 0;
    }
    if (a.Length == 2 && a[0] == "finish") { Thread.Sleep(int.Parse(a[1])); File.WriteAllText(State, "idle"); return 0; }
    int ms = int.Parse(a[0]), code = int.Parse(a[1]); Process child = null;
    int i = Array.IndexOf(a, "--spawn");
    if (i >= 0) child = Process.Start(new ProcessStartInfo(a[i + 1], string.Join(" ", a.Skip(i + 2).Select(Quote))) { UseShellExecute = false, CreateNoWindow = true });
    Thread.Sleep(ms); if (child != null) child.WaitForExit();
    return code;
  }
}
