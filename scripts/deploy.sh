#!/usr/bin/env bash
# Builds the production image on this machine and ships it to the server.
# See docs/DEPLOY.md.
#
#   scripts/deploy.sh                          # root@45.76.238.138
#   DEPLOY_SSH="ssh -i ~/.ssh/key user@host" scripts/deploy.sh
#
# The server is too small to build on, so the image is built here for
# linux/amd64, sent over SSH and loaded there. Migrations and the seed run
# before the new app starts. The server's .env is never touched.
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOY_SSH="${DEPLOY_SSH:-ssh root@45.76.238.138}"
APP_DIR="${APP_DIR:-/srv/impeccabyte-crm}"
IMAGE="impeccabyte-crm:prod"

echo "Building $IMAGE from $(git rev-parse --short HEAD)..."
case "$(docker info --format '{{.Architecture}}')" in
  aarch64|arm64)
    # Compile natively, install node_modules for amd64 (see Dockerfile.cross).
    # Each base image is named by its own digest, so the two cannot be mixed up.
    node_ref() {
      docker manifest inspect node:22-alpine | python3 -c '
import json, sys
print("node@" + next(m["digest"] for m in json.load(sys.stdin)["manifests"]
                     if m["platform"]["os"] == "linux" and m["platform"]["architecture"] == sys.argv[1]))' "$1"
    }
    docker build -f Dockerfile.cross -t "$IMAGE" \
      --build-arg NODE_AMD64="$(node_ref amd64)" --build-arg NODE_ARM64="$(node_ref arm64)" . ;;
  *) docker build -t "$IMAGE" . ;;
esac

echo "Sending the image and compose file..."
docker save "$IMAGE" | gzip | $DEPLOY_SSH "gunzip | docker load"
$DEPLOY_SSH "cat > $APP_DIR/docker-compose.prod.yml" < docker-compose.prod.yml

echo "Starting..."
$DEPLOY_SSH "cd $APP_DIR && [ -f .env ] || { echo 'No .env in $APP_DIR; see docs/DEPLOY.md.'; exit 1; }
  docker network inspect edge >/dev/null 2>&1 || docker network create edge >/dev/null
  docker compose up -d --remove-orphans --wait app worker
  docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health; echo
  docker image prune -f >/dev/null"

echo "Deployed $(git rev-parse --short HEAD)."
