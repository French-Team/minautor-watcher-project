@echo off
chcp 65001 >nul 2>&1
title Watcher Service - Launcher
color 0B

set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

:menu
cls
echo.
echo  =============================================
echo         WATCHER SERVICE - Launcher
echo  =============================================
echo.
echo    [1]  Lancer le watcher sur un dossier
echo    [2]  Lancer sur le dossier courant du projet
echo    [3]  Ouvrir la config (.env.local)
echo    [4]  Ouvrir le dossier des logs
echo.
echo    [0]  Quitter
echo.
echo  =============================================
echo.
set /p "choice=  Votre choix : "

if "%choice%"=="1" goto launch_custom
if "%choice%"=="2" goto launch_default
if "%choice%"=="3" goto open_config
if "%choice%"=="4" goto open_logs
if "%choice%"=="0" goto quit

echo.
echo  Choix invalide. Appuyez sur une touche...
pause >nul
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
    echo.
    echo  Entree pour retourner au menu...
    pause >nul
    goto menu
)

echo.
echo  Demarrage du watcher sur : %WATCH_DIR%
echo  Une nouvelle fenetre s'ouvre. Vous pouvez lancer d'autres watchers depuis ici.
echo.
timeout /t 2 >nul

start cmd /k "cd /d "%PROJECT_DIR%" && title Watcher - %WATCH_DIR% && npx tsx src/index.ts start -d "%WATCH_DIR%""

echo  Watcher lance ! Entree pour revenir au menu...
pause >nul
goto menu

:launch_default
cls
echo.
echo  --- Lancer sur le dossier du projet ---
echo.
echo  Repertoire : %PROJECT_DIR%
echo.
echo  Demarrage du watcher...
echo.
timeout /t 1 >nul

start cmd /k "cd /d "%PROJECT_DIR%" && title Watcher - %PROJECT_DIR% && npx tsx src/index.ts start -d "%PROJECT_DIR%""

echo  Watcher lance ! Entree pour revenir au menu...
pause >nul
goto menu

:open_config
cls
echo.
echo  Ouverture de .env.local ...
echo.
if exist "%PROJECT_DIR%\.env.local" (
    start notepad "%PROJECT_DIR%\.env.local"
) else (
    echo  [ERREUR] Fichier .env.local introuvable.
)
echo.
echo  Entree pour revenir au menu...
pause >nul
goto menu

:open_logs
cls
echo.
echo  Ouverture du dossier logs...
echo.
if exist "%PROJECT_DIR%\logs" (
    start explorer "%PROJECT_DIR%\logs"
) else (
    echo  [INFO] Le dossier logs n'existe pas encore. Il sera cree au premier lancement.
)
echo.
echo  Entree pour revenir au menu...
pause >nul
goto menu

:quit
cls
echo.
echo  A bientot !
echo.
timeout /t 1 >nul
exit /b 0
