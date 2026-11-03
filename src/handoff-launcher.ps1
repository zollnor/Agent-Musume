# agent-musume-managed-handoff:v1
# No command interpreter is involved in forwarding native arguments.
function ConvertTo-NativeArgument([AllowEmptyString()][string]$Value) {
  $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
  $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
  return '"' + $escaped + '"'
}
$taskStart = [System.Diagnostics.ProcessStartInfo]::new()
$taskStart.FileName = __EXECUTABLE__
$taskStart.UseShellExecute = $false
$taskStart.CreateNoWindow = $true
$taskStart.RedirectStandardOutput = $true
$taskStart.RedirectStandardError = $true
$taskStart.EnvironmentVariables['ELECTRON_RUN_AS_NODE'] = '1'
$taskNativeArguments = @(__ENTRY__) + @($args)
$taskStart.Arguments = ($taskNativeArguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' '
$taskProcess = [System.Diagnostics.Process]::Start($taskStart)
$taskError = $taskProcess.StandardError.ReadToEndAsync()
try {
  while ($null -ne ($taskLine = $taskProcess.StandardOutput.ReadLine())) { [Console]::Out.WriteLine($taskLine) }
  $taskProcess.WaitForExit()
  [Console]::Error.Write($taskError.GetAwaiter().GetResult())
  $taskResult = $taskProcess.ExitCode
} finally {
  if (-not $taskProcess.HasExited) { & taskkill.exe /pid $taskProcess.Id /t /f | Out-Null }
  $taskProcess.Dispose()
}
exit $taskResult
