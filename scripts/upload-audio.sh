#!/usr/bin/env bash
# upload-audio.sh — Upload adhan MP3 files from tawkit-9/audio/ to S3
#
# What it does:
#   1. Resolves the S3 bucket name (from CloudFormation stack output or AWS account ID)
#   2. Uploads:
#        tawkit-9/audio/audio_azan.mp3  → s3://<bucket>/audio/adhan.mp3
#        tawkit-9/audio/audio_fajr.mp3  → s3://<bucket>/audio/adhan-fajr.mp3
#   3. Makes the audio/ prefix publicly readable (required for Alexa SSML <audio> src)
#   4. Verifies each file is publicly reachable via its HTTPS URL
#
# Usage (run from repo root):
#   chmod +x scripts/upload-audio.sh
#   ./scripts/upload-audio.sh

set -euo pipefail

REGION="us-east-1"
STACK_NAME="my-prayer-time"
AUDIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/tawkit-9/audio"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  upload-audio.sh — Adhan MP3 → S3 (public HTTPS)    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Resolve bucket name ──────────────────────────────────────────────────────
echo "[1/5] Resolving S3 bucket name..."

BUCKET=""

# Try CloudFormation stack output first (most reliable after sam deploy)
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ContentBucketName'].OutputValue" \
  --output text 2>/dev/null || true)

# Fall back: query the stack directly for the bucket physical resource ID
if [[ -z "$BUCKET" || "$BUCKET" == "None" ]]; then
  BUCKET=$(aws cloudformation describe-stack-resource \
    --stack-name "$STACK_NAME" \
    --logical-resource-id ContentBucket \
    --region "$REGION" \
    --query "StackResourceDetail.PhysicalResourceId" \
    --output text 2>/dev/null || true)
fi

if [[ -z "$BUCKET" || "$BUCKET" == "None" ]]; then
  echo "  ✗ ERROR: Could not resolve bucket name. Run 'sam deploy' first, or check AWS CLI config."
  exit 1
fi

echo "  ✓ Bucket: s3://${BUCKET}"

# ── Verify source files ──────────────────────────────────────────────────────
echo ""
echo "[2/5] Verifying source MP3 files..."

AZAN_SRC="${AUDIO_DIR}/audio_azan.mp3"
FAJR_SRC="${AUDIO_DIR}/audio_fajr.mp3"

for f in "$AZAN_SRC" "$FAJR_SRC"; do
  if [[ ! -f "$f" ]]; then
    echo "  ✗ ERROR: Source file not found: $f"
    exit 1
  fi
  SIZE=$(du -sh "$f" | cut -f1)
  echo "  ✓ $(basename "$f")  ($SIZE)"
done

# ── Create bucket if it doesn't exist yet ────────────────────────────────────
echo ""
echo "[3/5] Ensuring bucket exists..."

if ! aws s3 ls "s3://${BUCKET}" --region "$REGION" &>/dev/null; then
  echo "  ℹ  Bucket not found — creating..."
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
  echo "  ✓ Bucket created"
else
  echo "  ✓ Bucket already exists"
fi

# ── Upload ───────────────────────────────────────────────────────────────────
echo ""
echo "[4/5] Uploading audio files..."

aws s3 cp "$AZAN_SRC" "s3://${BUCKET}/audio/adhan.mp3" \
  --content-type "audio/mpeg" \
  --region "$REGION"
echo "  ✓ audio_azan.mp3 → s3://${BUCKET}/audio/adhan.mp3"

aws s3 cp "$FAJR_SRC" "s3://${BUCKET}/audio/adhan-fajr.mp3" \
  --content-type "audio/mpeg" \
  --region "$REGION"
echo "  ✓ audio_fajr.mp3 → s3://${BUCKET}/audio/adhan-fajr.mp3"

# ── Apply public-read policy on audio/* (required for Alexa SSML <audio>) ───
# Alexa's audio renderer fetches the MP3 directly — must be public HTTPS.
# Only audio/ prefix is public; everything else stays private.
echo ""
echo "[5/5] Applying public-read policy on audio/* ..."

# Step A: Lift BlockPublicPolicy + RestrictPublicBuckets (ACL blocks remain)
aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# Step B: Attach bucket policy granting s3:GetObject on audio/* only
aws s3api put-bucket-policy \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Sid\": \"AllowPublicReadAudio\",
      \"Effect\": \"Allow\",
      \"Principal\": \"*\",
      \"Action\": \"s3:GetObject\",
      \"Resource\": \"arn:aws:s3:::${BUCKET}/audio/*\"
    }]
  }"

echo "  ✓ Bucket policy applied (audio/* = public, everything else = private)"

# ── Verify public access ─────────────────────────────────────────────────────
ADHAN_URL="https://${BUCKET}.s3.${REGION}.amazonaws.com/audio/adhan.mp3"
FAJR_URL="https://${BUCKET}.s3.${REGION}.amazonaws.com/audio/adhan-fajr.mp3"

echo ""
echo "  Verifying public HTTPS access..."
sleep 2  # brief pause for policy propagation

ALL_OK=true
for URL in "$ADHAN_URL" "$FAJR_URL"; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --head "$URL" 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" == "200" ]]; then
    echo "  ✓ HTTP $HTTP_CODE  $URL"
  else
    echo "  ✗ HTTP $HTTP_CODE  $URL  (policy may need ~30s to propagate — re-run to verify)"
    ALL_OK=false
  fi
done

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  Adhan URL (Fajr):    $FAJR_URL"
echo "  Adhan URL (other):   $ADHAN_URL"
echo ""
echo "  These URLs are hardcoded in lambda/index.js — no code change needed."
echo ""
if [[ "$ALL_OK" == "true" ]]; then
  echo "  ✓ All files verified public. Deploy when ready:"
  echo "    sam deploy && ask deploy"
else
  echo "  ⚠  Verification failed — run again in 30s, or check bucket policy in AWS Console."
fi
echo "══════════════════════════════════════════════════════════════"
echo ""
