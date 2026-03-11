#!/usr/bin/env bash
# Create GitHub remote repo and push (run in your terminal where 'gh auth login' was done).
# Usage: ./scripts/create-remote-repo.sh [repo-name]
set -e
REPO_NAME="${1:-tawkit}"
cd "$(dirname "$0")/.."
if ! command -v gh &>/dev/null; then
  echo "GitHub CLI (gh) not found. Install: brew install gh, then run: gh auth login"
  exit 1
fi
if ! gh auth status &>/dev/null; then
  echo "Not logged in to GitHub. Run: gh auth login"
  exit 1
fi
echo "Creating repo: $REPO_NAME (public)..."
gh repo create "$REPO_NAME" --public --source=. --remote=origin --push \
  --description "Tawkit Echo — Islamic prayer times Alexa Skill for Echo Show (APL widget, AlAdhan API)"
echo "Done. Repo: https://github.com/$(gh api user -q .login)/$REPO_NAME"
