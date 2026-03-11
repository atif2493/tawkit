#!/usr/bin/env bash
# deploy.sh — Build and deploy Tawkit Echo (SAM + ASK)
# Usage: ./scripts/deploy.sh [production]
# Depends: sam, ask-cli, aws cli. Run from repo root.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "[deploy] Building Lambda (lambda/)..."
cd lambda && npm install --production 2>/dev/null || true
cd ..

echo "[deploy] SAM build..."
sam build

echo "[deploy] SAM deploy (guided on first run)..."
sam deploy ${1:+--parameter-overrides Environment=$1}

echo "[deploy] Deploy Alexa skill (ask deploy)..."
ask deploy

echo "[deploy] Done. Enable skill in Alexa app and add widget on Echo Show."
