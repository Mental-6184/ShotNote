Dim shell, fso, root, electron, appPath
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
appPath = root

electron = root & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(electron) Then
  electron = root & "\node_modules\electron\electron.exe"
End If

If Not fso.FileExists(electron) Then
  MsgBox "Electron runtime not found. Please run npm install first.", vbCritical, "ShotNote"
  WScript.Quit 1
End If

shell.Run """" & electron & """ """ & appPath & """", 1, False
