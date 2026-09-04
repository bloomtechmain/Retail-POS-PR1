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
  ; Clear license/activation state so a reinstall always requires the
  ; license key again — runs on every explicit uninstall AND on every
  ; version upgrade (the NSIS installer silently uninstalls the previous
  ; version first). Deliberately leaves pgdata/ (local sales, inventory,
  ; users) untouched so upgrades never lose a customer's real data.
  ;
  ; NOTE: Electron's userData folder is named after package.json's "name"
  ; field ("retail-pos"), NOT the productName ("BloomPOS") — verify with
  ; app.getPath('userData') before changing this path.
  Delete "$APPDATA\retail-pos\activation.token"
  Delete "$APPDATA\retail-pos\preset-credentials.json"
!macroend
