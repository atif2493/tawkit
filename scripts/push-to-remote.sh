#!/usr/bin/env bash
# Add existing GitHub remote and push. Use when you already created the repo on GitHub.
# Usage: ./scripts/push-to-remote.sh <repo-url>
# Example: ./scripts/push-to-remote.sh https://github.com/atifjaffery/tawkit.git
set -e
REPO_URL="$1"
if [ -z "$REPO_URL" ]; then
  echo "Usage: $0 <repo-url>"
  echo "Example: $0 https://github.com/YOUR_USERNAME/YOUR_REPO.git"
  exit 1
fi
cd "$(dirname "$0")/.."
if git remote get-url origin &>/dev/null; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi
git push -u origin main
echo "Done. Remote: $REPO_URL"
