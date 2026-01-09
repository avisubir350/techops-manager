!include "MUI2.nsh"

!define APPNAME "Lokenath Computer Manager"
!define EXE_NAME "LokenathManager.exe"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall${APPNAME}"

Name "${APPNAME}"
OutFile "Lokenath_Computer_Windows_Setup.exe"
InstallDir "$PROGRAMFILES64\LokenathComputer"

# Request Admin rights
RequestExecutionLevel admin

!define MUI_ICON "assets/logo.ico"
!define MUI_UNICON "assets/logo.ico"

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
    # Force 64-bit view so it shows in Control Panel
    SetRegView 64
    
    # Overwrite old files if they exist
    SetOverwrite on
    
    SetOutPath $INSTDIR
    File "LokenathManager.exe"
    File "assets/logo.ico"
    
    WriteUninstaller "$INSTDIR\uninstall.exe"
    
    # Registry Keys for Control Panel (Programs & Features)
    WriteRegStr HKLM "${UNINST_KEY}" "DisplayName" "${APPNAME}"
    WriteRegStr HKLM "${UNINST_KEY}" "UninstallString" "$INSTDIR\uninstall.exe"
    WriteRegStr HKLM "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\logo.ico"
    WriteRegStr HKLM "${UNINST_KEY}" "Publisher" "Lokenath Computer"
    
    # Shortcut with "Start In" folder
    SetOutPath $INSTDIR 
    CreateShortcut "$DESKTOP\Lokenath Computer.lnk" "$INSTDIR\${EXE_NAME}" "" "$INSTDIR\logo.ico"
SectionEnd

Section "Uninstall"
    SetRegView 64
    Delete "$INSTDIR\LokenathManager.exe"
    Delete "$INSTDIR\logo.ico"
    Delete "$INSTDIR\uninstall.exe"
    Delete "$DESKTOP\Lokenath Computer.lnk"
    DeleteRegKey HKLM "${UNINST_KEY}"
    RMDir "$INSTDIR"
SectionEnd
