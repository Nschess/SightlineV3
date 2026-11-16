' Player-invoked launcher only. Starts the local game bridge without a console window.
Option Explicit
Dim shell, files, root, node, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
node = "node.exe"
If files.FileExists(root & "\runtime\node.exe") Then node = root & "\runtime\node.exe"
command = Chr(34) & node & Chr(34) & " " & Chr(34) & root & "\tools\offline-static-server.cjs" & Chr(34) & " --lan-client --open-game"
On Error Resume Next
shell.Run command, 0, False
If Err.Number <> 0 Then MsgBox "Sightline could not start. Install the supported Node.js runtime or use the bundled Windows runtime.", 48, "Sightline"
