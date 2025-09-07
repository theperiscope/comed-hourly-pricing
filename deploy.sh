#!/usr/bin/env bash
# Bash deployment script for Linux (e.g., Ubuntu with Docker Desktop or Docker Engine)
# Mirrors the behavior of deploy.cmd

# set -e: Exit immediately if a command exits with a non-zero status.
# set -u: Treat unset variables as an error when substituting.
# set -o pipefail: The return value of a pipeline is the status of the last
#                  command to exit with a non-zero status, or zero if no
#                  command exited with a non-zero status.
set -euo pipefail

containerName="comed-hourly-pricing"
imageName="comed-hourly-pricing:latest"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
envFile="${script_dir}/.env"
tempFileName="theperiscope-comed-hourly-pricing.tar"

echo "Using script directory: ${script_dir}"

# preconditions: required commands
for cmd in docker ssh scp; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: $cmd is required but not installed or not in PATH." >&2
    exit 1
  fi
done

# load remoteServer and remoteDir from .env file (KEY=VALUE, lines starting with # are comments)
if [[ ! -f "$envFile" ]]; then
  echo "Environment file '$envFile' not found." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
. "$envFile"
set +a

if [[ -z "${remoteServer:-}" ]]; then
  echo "remoteServer not defined in $envFile" >&2
  exit 1
fi
if [[ -z "${remoteDir:-}" ]]; then
  echo "remoteDir not defined in $envFile" >&2
  exit 1
fi

echo "Using remoteServer=${remoteServer}"
echo "Using remoteDir=${remoteDir}"

# ensure Docker is available (Docker Desktop or dockerd)
if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not reachable. Ensure Docker Desktop (or Docker Engine) is running." >&2
  exit 1
fi

# start SSH agent if needed and add keys (ignore if none)
if [[ -z "${SSH_AUTH_SOCK:-}" ]]; then
  echo "Starting ssh-agent..."
  eval "$(ssh-agent -s)"
fi
echo "Adding SSH keys to agent (if any)..."
ssh-add >/dev/null 2>&1 || true

# create tar of local image
echo "Downloading Docker image locally..."
docker save -o "$tempFileName" "$imageName"

# ensure remote dir exists
echo "Ensuring remote directory exists..."
ssh "$remoteServer" "mkdir -p '$remoteDir'"

# copy tar to remote
echo "Copying Docker image to server..."
scp "$tempFileName" "${remoteServer}:${remoteDir}/"

# stop and remove existing container on remote (ignore errors if not present)
echo "Stopping container on remote (if running)..."
ssh "$remoteServer" "docker stop '$containerName' >/dev/null 2>&1 || true"
echo "Removing container on remote (if exists)..."
ssh "$remoteServer" "docker rm '$containerName' >/dev/null 2>&1 || true"

# load image and run container
echo "Loading container image on remote..."
ssh "$remoteServer" "docker load -i '${remoteDir}/${tempFileName}'"

echo "Starting container on remote..."
ssh "$remoteServer" "docker run -d -p 8123:8123 --restart unless-stopped --name '$containerName' '$imageName'"

# cleanup remote and local
echo "Cleaning up remote..."
ssh "$remoteServer" "rm -f '${remoteDir}/${tempFileName}' && docker image prune -a -f && docker volume prune -f"

echo "Cleaning up local..."
rm -f "$tempFileName"
docker image prune -a -f
docker volume prune -f

echo "Deployment completed."
