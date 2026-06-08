; RetailPOS Custom NSIS Installer Script
; This script adds a license key verification page to the installer.
; The actual online verification happens inside the Electron app on first launch —
; the installer just collects the key and passes it to the app via a file.

!macro customHeader
  ; Nothing needed in header
!macroend

!macro customInit
  ; Nothing needed in init
!macroend

!macro customInstall
  ; Write a first-run marker so the app knows it was just installed
  FileOpen $0 "$INSTDIR\resources\electron\.first_run" w
  FileWrite $0 "1"
  FileClose $0
!macroend

!macro customUnInstall
  ; Remove user data on uninstall (optional — commented out to preserve data)
  ; RMDir /r "$APPDATA\RetailPOS"
!macroend
