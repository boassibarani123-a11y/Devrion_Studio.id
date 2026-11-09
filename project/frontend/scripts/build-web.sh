#!/usr/bin/env bash
# Build the static Web App and place it where the backend serves it (/api/app).
set -euo pipefail
cd "$(dirname "$0")/.."
WEB_BASE_URL=/api/app npx expo export -p web --output-dir ../backend/web_dist
echo "Web app built -> backend/web_dist (open <BACKEND_URL>/api/app)"
