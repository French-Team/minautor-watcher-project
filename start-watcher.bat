@echo off
title Watcher Service - Launcher
color 0B

set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"

REM --- Environment banner via pure Node.js ---
echo.
node scripts\env-banner.cjs
echo.

REM --- Reset logs on startup (fichiers uniques, pas de rotation) ---
if exist "%PROJECT_DIR%\logs\combined.log" type nul > "%PROJECT_DIR%\logs\combined.log"
if exist "%PROJECT_DIR%\logs\error.log" type nul > "%PROJECT_DIR%\logs\error.log"
if exist "%PROJECT_DIR%\logs\warnings.log" type nul > "%PROJECT_DIR%\logs\warnings.log"

REM --- Auto-rebuild dist pour garantir la coherence ---
echo.
echo  [BUILD] Compilation TypeScript...
cd /d "%PROJECT_DIR%"
call npx tsc
if %ERRORLEVEL% neq 0 (
    echo  [ERREUR] La compilation a echoue. Corrigez les erreurs avant de lancer le watcher.
    pause
    exit /b 1
)
echo  [BUILD] Compilation reussie.
echo.

:menu
echo  =============================================
echo         WATCHER SERVICE - Launcher
echo  =============================================
echo.
echo    [1]  Lancer le watcher sur un dossier
echo    [2]  Lancer sur le dossier du projet
echo    [3]  Scanner un dossier (one-shot)
echo    [4]  Analyser un dossier
echo    [5]  Preview corrections (dry-run)
echo.
echo    [6]  Ouvrir la config (.env.local)
echo    [7]  Ouvrir le dossier des logs
echo.
echo    [8]  Verifier l'environnement (doctor)
echo    [9]  Installer les outils manquants
echo   [10]  Ouvrir les logs warnings
echo.
echo    [0]  Quitter
echo.
echo  =============================================
echo    Nouveau : Les options [1] et [2] permettent
echo    de traiter les fichiers existants au demarrage.
echo  =============================================
echo.
set /p "choice=  Votre choix : "

if "%choice%"=="1" goto launch_custom
if "%choice%"=="2" goto launch_default
if "%choice%"=="3" goto scan_project
if "%choice%"=="4" goto analyze_project
if "%choice%"=="5" goto preview_files
if "%choice%"=="6" goto open_config
if "%choice%"=="7" goto open_logs
if "%choice%"=="8" goto doctor
if "%choice%"=="9" goto install_tools
if "%choice%"=="10" goto open_warnings
if "%choice%"=="0" goto quit

echo.
echo  Choix invalide.
echo.
pause
goto menu

:launch_custom
cls
echo.
echo  --- Lancer le watcher ---
echo.
echo  Collez ou saisissez le chemin du dossier a surveiller :
echo  (ex: C:\Mon\Projet ou D:\workspace\mon-app)
echo.
set /p "WATCH_DIR=  Chemin : "

if "%WATCH_DIR%"=="" (
    echo.
    echo  Aucun chemin saisi. Retour au menu...
    timeout /t 2 >nul
    goto menu
)

if not exist "%WATCH_DIR%" (
    echo.
    echo  [ERREUR] Le dossier "%WATCH_DIR%" n'existe pas.
    pause
    goto menu
)

echo.
echo  Options de demarrage :
echo    [1]  Demarrer (changements uniquement)
echo    [2]  Demarrer + traiter les fichiers existants
echo    [3]  Demarrer + traiter les existants (delai 50ms)
echo.
set /p "startmode=  Votre choix : "

set "START_OPTS="
if "%startmode%"=="2" set "START_OPTS=--process-existing"
if "%startmode%"=="3" set "START_OPTS=--process-existing --process-existing-delay 50"

echo.
echo  Demarrage du watcher sur : %WATCH_DIR%
timeout /t 2 >nul

start cmd /k "cd /d "%PROJECT_DIR%" && title Watcher && npx tsx src/index.ts start -d "%WATCH_DIR%" %START_OPTS%"

echo  Watcher lance !
echo.
pause
cls
goto menu

:launch_default
cls
echo.
echo  --- Lancer sur le dossier du projet ---
echo.
echo  Repertoire : %PROJECT_DIR%
echo.
echo  Options de demarrage :
echo    [1]  Demarrer (changements uniquement)
echo    [2]  Demarrer + traiter les fichiers existants
echo    [3]  Demarrer + traiter les existants (delai 50ms)
echo.
set /p "startmode=  Votre choix : "

set "START_OPTS="
if "%startmode%"=="2" set "START_OPTS=--process-existing"
if "%startmode%"=="3" set "START_OPTS=--process-existing --process-existing-delay 50"

echo.
echo  Demarrage du watcher...
timeout /t 1 >nul

start cmd /k "cd /d "%PROJECT_DIR%" && title Watcher && npx tsx src/index.ts start -d "%PROJECT_DIR%" %START_OPTS%"

echo  Watcher lance !
echo.
pause
cls
goto menu

:scan_project
cls
echo.
echo  --- Scanner un dossier (one-shot) ---
echo.
echo  Collez ou saisissez le chemin du dossier a scanner :
echo.
set /p "SCAN_DIR=  Chemin : "

if "%SCAN_DIR%"=="" (
    echo.
    echo  Aucun chemin saisi. Retour au menu...
    timeout /t 2 >nul
    goto menu
)

if not exist "%SCAN_DIR%" (
    echo.
    echo  [ERREUR] Le dossier "%SCAN_DIR%" n'existe pas.
    pause
    goto menu
)

echo.
echo  Options du scan :
echo    [1]  Scan complet
echo    [2]  Correction uniquement
echo    [3]  Injection uniquement
echo    [4]  Dry-run
echo.
set /p "scanmode=  Votre choix : "

set "SCAN_OPTS=--all"
if "%scanmode%"=="2" set "SCAN_OPTS=--fix"
if "%scanmode%"=="3" set "SCAN_OPTS=--inject"
if "%scanmode%"=="4" set "SCAN_OPTS=--dry-run --all"

echo.
echo  Scan de : %SCAN_DIR%
echo.

cd /d "%PROJECT_DIR%" && npx tsx src/index.ts scan %SCAN_OPTS% -d "%SCAN_DIR%"

echo.
pause
cls
goto menu

:analyze_project
cls
echo.
echo  --- Analyser un dossier ---
echo.
echo  Collez ou saisissez le chemin du dossier a analyser :
echo.
set /p "ANALYZE_DIR=  Chemin : "

if "%ANALYZE_DIR%"=="" (
    echo.
    echo  Aucun chemin saisi. Retour au menu...
    timeout /t 2 >nul
    goto menu
)

if not exist "%ANALYZE_DIR%" (
    echo.
    echo  [ERREUR] Le dossier "%ANALYZE_DIR%" n'existe pas.
    pause
    goto menu
)

echo.
echo  Analyse de : %ANALYZE_DIR%
echo.

cd /d "%PROJECT_DIR%" && npx tsx src/index.ts analyze -d "%ANALYZE_DIR%"

echo.
pause
cls
goto menu

:preview_files
cls
echo.
echo  --- Preview corrections (dry-run) ---
echo.
echo  Collez le chemin du fichier a preview :
echo.
set /p "PREVIEW_FILE=  Chemin : "

if "%PREVIEW_FILE%"=="" (
    echo.
    echo  Aucun chemin saisi. Retour au menu...
    timeout /t 2 >nul
    goto menu
)

if not exist "%PREVIEW_FILE%" (
    echo.
    echo  [ERREUR] Le fichier "%PREVIEW_FILE%" n'existe pas.
    pause
    goto menu
)

echo.
echo  Preview de : %PREVIEW_FILE%
echo.

cd /d "%PROJECT_DIR%" && npx tsx src/index.ts preview "%PREVIEW_FILE%"

echo.
pause
cls
goto menu

:doctor
cls
echo.
echo  --- Verifier l'environnement ---
echo.
cd /d "%PROJECT_DIR%" && npx tsx src/index.ts doctor
echo.
pause
cls
goto menu

:install_tools
cls
echo.
echo  --- Installation des outils manquants ---
echo.
cd /d "%PROJECT_DIR%" && node scripts\install-tools.cjs
echo.
pause
cls
goto menu

:open_config
cls
echo.
if exist "%PROJECT_DIR%\.env.local" (
    notepad "%PROJECT_DIR%\.env.local"
) else (
    echo  Fichier .env.local introuvable.
)
echo.
pause
cls
goto menu

:open_logs
cls
echo.
if exist "%PROJECT_DIR%\logs" (
    explorer "%PROJECT_DIR%\logs"
) else (
    echo  Le dossier logs n'existe pas encore.
)
echo.
pause
cls
goto menu

:open_warnings
cls
echo.
if exist "%PROJECT_DIR%\logs\warnings.log" (
    notepad "%PROJECT_DIR%\logs\warnings.log"
) else (
    echo  Aucun fichier warnings.log trouve.
    echo  Lancez le watcher pour generer des logs.
)
echo.
pause
cls
goto menu

:quit
cls
echo.
echo  A bientot !
echo.
timeout /t 1 >nul
exit /b 0