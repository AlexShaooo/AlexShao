#!/bin/bash
# Publish main's tree as a single fresh commit to the public repo.
# The public repo never receives history; dev happens here (private).
set -e
cd "$(dirname "$0")"
snapshot=$(git commit-tree -m "Deploy $(date +%Y-%m-%d)" "main^{tree}")
git push public "+$snapshot:refs/heads/main"
