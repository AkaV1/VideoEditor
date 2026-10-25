; Instalador de LineCut para Windows (Inno Setup). Se instala por usuario, sin permisos de administrador.
[Setup]
AppName=LineCut
AppVersion=1.0.0
AppPublisher=LineCut
DefaultDirName={autopf}\LineCut
DefaultGroupName=LineCut
PrivilegesRequired=lowest
OutputDir=out
OutputBaseFilename=LineCut-Setup
Compression=lzma2
SolidCompression=yes
SetupIconFile=linecut.ico
UninstallDisplayIcon={app}\LineCut.exe
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el escritorio"; GroupDescription: "Accesos directos:"

[Files]
Source: "dist\LineCut\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\LineCut"; Filename: "{app}\LineCut.exe"
Name: "{autodesktop}\LineCut"; Filename: "{app}\LineCut.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\LineCut.exe"; Description: "Abrir LineCut"; Flags: nowait postinstall skipifsilent
