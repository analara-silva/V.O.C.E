@echo off
REM ========================================================================
REM INSTALADOR AUTOMATIZADO - V.O.C.E EXTENSION
REM Instalação forçada da extensão Chrome em ambiente educacional
REM Requer privilégios de administrador
REM ========================================================================

setlocal enabledelayedexpansion
color 0A

REM Verificar se está rodando como administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Este script requer privilégios de ADMINISTRADOR!
    echo.
    echo Clique com botão direito no arquivo e selecione "Executar como administrador"
    echo.
    pause
    exit /b 1
)

cls
echo.
echo ========================================================================
echo   INSTALADOR V.O.C.E EXTENSION - MODO FORÇADO
echo ========================================================================
echo.
echo Este script irá:
echo   1. Criar pasta de instalação em C:\Program Files\V.O.C.E
echo   2. Copiar arquivos da extensão
echo   3. Instalar Native Messaging Host
echo   4. Configurar política de instalação forçada do Chrome
echo   5. Registrar manifesto no Registro do Windows
echo.
pause

REM ========================================================================
REM DEFINIR VARIÁVEIS
REM ========================================================================

set "INSTALL_PATH=C:\Program Files\V.O.C.E"
set "EXTENSION_ID=ijcnbijepmnkkeihkikjofmohhadjcnd"
set "NATIVE_HOST_NAME=com.voce.monitor"
set "SCRIPT_DIR=%~dp0"

echo [INFO] Diretório de origem: %SCRIPT_DIR%
echo [INFO] Diretório de instalação: %INSTALL_PATH%
echo.

REM ========================================================================
REM FASE 1: CRIAR ESTRUTURA DE PASTAS
REM ========================================================================

echo [FASE 1] Criando estrutura de diretórios...
if not exist "%INSTALL_PATH%" (
    mkdir "%INSTALL_PATH%"
    echo [OK] Pasta criada: %INSTALL_PATH%
) else (
    echo [OK] Pasta já existe: %INSTALL_PATH%
)

if not exist "%INSTALL_PATH%\host_manifest" (
    mkdir "%INSTALL_PATH%\host_manifest"
    echo [OK] Subpasta criada: host_manifest
)

if not exist "%INSTALL_PATH%\monitor-extension" (
    mkdir "%INSTALL_PATH%\monitor-extension"
    echo [OK] Subpasta criada: monitor-extension
)

if not exist "%INSTALL_PATH%\native_host" (
    mkdir "%INSTALL_PATH%\native_host"
    echo [OK] Subpasta criada: native_host
)

echo.

REM ========================================================================
REM FASE 2: COPIAR ARQUIVOS
REM ========================================================================

echo [FASE 2] Copiando arquivos da extensão...

REM Copiar arquivos de configuração
if exist "%SCRIPT_DIR%V.O.C.E\config.json" (
    copy "%SCRIPT_DIR%V.O.C.E\config.json" "%INSTALL_PATH%\" >nul
    echo [OK] config.json copiado
) else (
    echo [AVISO] config.json não encontrado
)

REM Copiar pasta monitor-extension
if exist "%SCRIPT_DIR%V.O.C.E\monitor-extension\extension" (
    xcopy "%SCRIPT_DIR%V.O.C.E\monitor-extension\extension" "%INSTALL_PATH%\monitor-extension\extension" /E /I /Y >nul
    echo [OK] Extensão Chrome copiada
) else (
    echo [AVISO] Pasta de extensão não encontrada
)

REM Copiar native_host
if exist "%SCRIPT_DIR%V.O.C.E\native_host\native_host.py" (
    copy "%SCRIPT_DIR%V.O.C.E\native_host\native_host.py" "%INSTALL_PATH%\native_host\" >nul
    echo [OK] native_host.py copiado
) else (
    echo [AVISO] native_host.py não encontrado
)

if exist "%SCRIPT_DIR%V.O.C.E\native_host\run_host.bat" (
    copy "%SCRIPT_DIR%V.O.C.E\native_host\run_host.bat" "%INSTALL_PATH%\native_host\" >nul
    echo [OK] run_host.bat copiado
) else (
    echo [AVISO] run_host.bat não encontrado
)

REM Copiar host_manifest
if exist "%SCRIPT_DIR%V.O.C.E\host_manifest\host_manifest.json" (
    copy "%SCRIPT_DIR%V.O.C.E\host_manifest\host_manifest.json" "%INSTALL_PATH%\host_manifest\" >nul
    echo [OK] host_manifest.json copiado
) else (
    echo [AVISO] host_manifest.json não encontrado
)

echo.

REM ========================================================================
REM FASE 3: APLICAR ARQUIVOS .REG DE INSTALAÇÃO
REM ========================================================================

echo [FASE 3] Aplicando configurações de Registro...

REM Aplicar install_host.reg
if exist "%SCRIPT_DIR%V.O.C.E\reg_setup\install_host.reg" (
    reg import "%SCRIPT_DIR%V.O.C.E\reg_setup\install_host.reg" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] Native Messaging Host registrado
    ) else (
        echo [ERRO] Falha ao registrar Native Messaging Host
    )
) else (
    echo [AVISO] install_host.reg não encontrado
)

REM Aplicar forceInstall.reg
if exist "%SCRIPT_DIR%V.O.C.E\reg_setup\forceInstall.reg" (
    reg import "%SCRIPT_DIR%V.O.C.E\reg_setup\forceInstall.reg" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] Política de instalação forçada registrada
    ) else (
        echo [ERRO] Falha ao registrar política de instalação
    )
) else (
    echo [AVISO] forceInstall.reg não encontrado
)

echo.

REM ========================================================================
REM FASE 4: CONFIGURAR PERMISSÕES DE PASTA
REM ========================================================================

echo [FASE 4] Configurando permissões de pasta...

REM Conceder permissões completas para SYSTEM e Administrators
icacls "%INSTALL_PATH%" /grant:r "SYSTEM:(OI)(CI)F" /T >nul 2>&1
icacls "%INSTALL_PATH%" /grant:r "Administrators:(OI)(CI)F" /T >nul 2>&1
icacls "%INSTALL_PATH%" /grant:r "Users:(OI)(CI)RX" /T >nul 2>&1

echo [OK] Permissões configuradas

echo.

REM ========================================================================
REM FASE 5: VERIFICAÇÃO FINAL
REM ========================================================================

echo [FASE 5] Verificando instalação...

if exist "%INSTALL_PATH%\config.json" (
    echo [OK] Arquivos de configuração instalados
) else (
    echo [AVISO] Alguns arquivos podem estar faltando
)

if exist "%INSTALL_PATH%\monitor-extension\extension\manifest.json" (
    echo [OK] Extensão Chrome instalada
) else (
    echo [AVISO] Extensão Chrome pode estar incompleta
)

if exist "%INSTALL_PATH%\native_host\native_host.py" (
    echo [OK] Native Host instalado
) else (
    echo [AVISO] Native Host pode estar incompleto
)

echo.

REM ========================================================================
REM CONCLUSÃO
REM ========================================================================

echo ========================================================================
echo   INSTALAÇÃO CONCLUÍDA!
echo ========================================================================
echo.
echo Próximos passos:
echo   1. Reinicie o Google Chrome para aplicar a política
echo   2. A extensão será instalada automaticamente
echo   3. Verifique em chrome://extensions (deve estar forçada)
echo.
echo Localização de instalação:
echo   %INSTALL_PATH%
echo.
echo.
pause

endlocal
exit /b 0
