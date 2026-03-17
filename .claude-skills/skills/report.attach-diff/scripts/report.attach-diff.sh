#!/usr/bin/env bash
set -euo pipefail
# Generate a git diff for embedding in the work report.
# Usage: report.attach-diff.sh [git-diff-args...]
# Defaults to HEAD (all uncommitted changes) if no args provided.

# Verify we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "Error: Not a git repository" >&2
  exit 1
fi

# Run git diff with provided args, or default to HEAD
if [ $# -eq 0 ]; then
  git diff HEAD
else
  git diff "$@"
fi
