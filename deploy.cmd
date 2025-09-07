@echo off
setlocal
set containerName=comed-hourly-pricing
set imageName=comed-hourly-pricing:latest
set "envFile=%~dp0.env"

rem Load remoteServer and remoteDir from local environment file
rem Expected file: .env (same directory as this script), lines are in format KEY=VALUE with # for comments
if not exist "%envFile%" (
  echo Environment file "%envFile%" not found.
  exit /b 1
)

rem parse .env file lines
for /f "usebackq tokens=1* delims== eol=#" %%A in ("%envFile%") do (
  set "%%A=%%B"
)

if "%remoteServer%"=="" (
  echo remoteServer not defined in %envFile%
  exit /b 1
)
if "%remoteDir%"=="" (
  echo remoteDir not defined in %envFile%
  exit /b 1
)

echo Using remoteServer=%remoteServer%
echo Using remoteDir=%remoteDir%
set tempFileName=theperiscope-comed-hourly-pricing.tar

echo Starting Docker Desktop...
rem in the Docker Desktop settings, 'Open Docker Dashboard when Docker Desktop starts' should be unchecked
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"

echo Caching SSH key-based authentication credentials...
rem NOTE: Git has its own ssh-agent and ssh-add which if called can conflict with the Windows OpenSSH ssh-agent and ssh-add
taskkill /im ssh-agent.exe /f 2>nul
ssh-agent
timeout /t 3
ssh-add

echo Downloading Docker image locally...
docker save -o %tempFileName% %imageName%
echo Copying Docker image to server...
scp %tempFileName% %remoteServer%:%remoteDir%/
echo Stopping container...
ssh %remoteServer% "docker stop %containerName%"
echo Removing container...
ssh %remoteServer% "docker rm %containerName%"
echo Loading container image...
ssh %remoteServer% "docker load -i %remoteDir%/%tempFileName%"
echo Starting container...
ssh %remoteServer% "docker run -d -p 8123:8123 --restart unless-stopped --name %containerName% %imageName%"

echo Cleaning up Linux...
ssh %remoteServer% "rm %remoteDir%/%tempFileName%"
ssh %remoteServer% "docker image prune -a -f"
ssh %remoteServer% "docker volume prune -f"

echo Cleaning up Windows...
del %tempFileName%
docker image prune -a -f
docker volume prune -f

echo Deployment completed.
