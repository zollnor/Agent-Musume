; electron-builder always stores a copy of the installer for its auto-updater. This program has no auto-updater,
; and the copy would stay in the user's profile after uninstalling.
; Then Windows' own transparent compression, the kind it uses for system files: the program takes about a third less
; space and reads back byte for byte. Video is already compressed and is left out. On a drive that is not NTFS it does nothing.
!macro customInstall
  RMDir /r "$LOCALAPPDATA\agent-musume-updater"
  Push $0
  StrCpy $0 "$WINDIR\Sysnative\compact.exe"
  IfFileExists "$0" +2
  StrCpy $0 "$SYSDIR\compact.exe"
  nsExec::Exec '"$0" /c /q /i /exe:lzx "$INSTDIR\*.exe" "$INSTDIR\*.dll" "$INSTDIR\*.dat" "$INSTDIR\*.pak" "$INSTDIR\*.bin" "$INSTDIR\*.html" "$INSTDIR\locales\*.pak"'
  Pop $0
  Pop $0
!macroend

; Starting with Windows is off until the user turns it on in the settings (src/settings-window.cjs); the entry is named
; after the app id. Uninstalling removes it; an update runs this uninstaller too, and keeps it.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${APP_ID}"
  ${endIf}
!macroend
