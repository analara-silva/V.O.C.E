@echo off
:: #############################################
:: ## Instalador do Host Nativo para TCC Monitor
:: #############################################

echo.
echo Este script precisa de privilegios de administrador para continuar.
echo.

:: Requisita elevação para administrador
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo Solicitando privilegios de administrador...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
    if exist "%temp%\getadmin.vbs" ( del "%temp%\getadmin.vbs" )
    pushd "%CD%"
    CD /D "%~dp0"

:: --- Início da Lógica de Instalação ---

set HOST_NAME=com.meutcc.monitor
set INSTALL_DIR=C:\ProgramData\TccMonitorHost
set MOZ_PATH=%USERPROFILE%\AppData\Mozilla\NativeMessagingHosts

echo.
echo --- Iniciando a instalacao do Host Nativo ---

echo.
echo [1/4] Criando diretorio de instalacao em %INSTALL_DIR% ...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo.
echo [2/4] Copiando arquivos do aplicativo...
copy /Y "native_host.py" "%INSTALL_DIR%"
copy /Y "run_host.bat" "%INSTALL_DIR%"
copy /Y "host_manifest.json" "%INSTALL_DIR%"

echo.
echo [3/4] Configurando a chave do Registro do Chrome...
set REG_KEY="HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts\%HOST_NAME%"
set REG_VALUE="%INSTALL_DIR%\host_manifest.json"
reg add %REG_KEY% /ve /t REG_SZ /d %REG_VALUE% /f

echo.
echo [4/4] Registrando host para o Firefox...
if not exist "%MOZ_PATH%" mkdir "%MOZ_PATH%"
copy /Y "%INSTALL_DIR%\host_manifest.json" "%MOZ_PATH%\%HOST_NAME%.json"

echo.
echo --- Instalacao concluida com sucesso para Chrome e Firefox! ---
echo.
pause
