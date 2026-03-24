#!/usr/bin/env bash
# deploy.sh — Build and deploy My Prayer Time (SAM + ASK)
# Usage: ./scripts/deploy.sh
# Depends: sam, ask-cli, aws cli. Run from repo root.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  deploy.sh — My Prayer Time full deploy              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 1. Install Lambda deps ───────────────────────────────────────────────────
echo "[1/5] Installing Lambda dependencies..."
cd lambda && npm install --production 2>/dev/null || true
cd ..

# ── 2. SAM build ────────────────────────────────────────────────────────────
echo "[2/5] SAM build..."
sam build

# ── 3. SAM deploy ───────────────────────────────────────────────────────────
echo "[3/5] SAM deploy (using samconfig.toml)..."
sam deploy

# ── 4. Upload adhan audio to the CF-managed bucket ───────────────────────────
# Must run AFTER sam deploy so the bucket exists and S3_BUCKET env var is set.
echo "[4/5] Uploading adhan audio to S3..."
bash scripts/upload-audio.sh

# ── 5. Deploy Alexa skill ─────────────────────────────────────────────────
echo "[5/5] Deploying Alexa skill..."
ask deploy

echo ""
echo "✓ Deploy complete. Open the skill in the Alexa app to test."
