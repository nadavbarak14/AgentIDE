#!/usr/bin/env bash
set -euo pipefail

# Setup branch protection for main branch
# Requires: gh CLI authenticated with repo admin access

echo "=== Branch Protection Setup ==="

# Check gh CLI
if ! command -v gh &>/dev/null; then
  echo "ERROR: gh CLI not found. Install from https://cli.github.com/"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "ERROR: gh CLI not authenticated. Run: gh auth login"
  exit 1
fi

# Detect repo
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
echo "Repository: $REPO"

# Apply branch protection rules
echo "Applying branch protection to main..."
gh api "repos/$REPO/branches/main/protection" \
  -X PUT \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint-typecheck", "test-backend", "test-frontend"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

echo "Branch protection applied."

# Configure merge strategy — rebase-merge only
echo "Configuring merge strategy (rebase-merge only)..."
gh api "repos/$REPO" \
  -X PATCH \
  -f allow_merge_commit=false \
  -f allow_squash_merge=false \
  -f allow_rebase_merge=true \
  >/dev/null

echo "Merge strategy configured."

# Verify
echo ""
echo "=== Verification ==="
CHECKS=$(gh api "repos/$REPO/branches/main/protection" --jq '.required_status_checks.contexts | join(", ")')
echo "Required checks: $CHECKS"

LINEAR=$(gh api "repos/$REPO/branches/main/protection" --jq '.required_linear_history.enabled')
echo "Linear history required: $LINEAR"

REBASE=$(gh api "repos/$REPO" --jq '.allow_rebase_merge')
MERGE=$(gh api "repos/$REPO" --jq '.allow_merge_commit')
SQUASH=$(gh api "repos/$REPO" --jq '.allow_squash_merge')
echo "Allow rebase-merge: $REBASE"
echo "Allow merge-commit: $MERGE"
echo "Allow squash-merge: $SQUASH"

echo ""
echo "✓ Branch protection setup complete!"
