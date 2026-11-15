#!/usr/bin/env bash
# Usage: ./bump-version.sh 1.2.1
# Updates version.js, sw cache marker, manifest, and index.html cache-bust queries (Emberwell PWA).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
NEW="${1:-}"
if [[ ! "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Usage: $0 <semver>   e.g. $0 1.0.1" >&2
  exit 1
fi
OLD="$(sed -n 's/^var APP_VERSION = "\([^"]*\)";.*/\1/p' "$ROOT/version.js" | head -1)"
if [[ -z "$OLD" ]]; then
  echo "Could not read APP_VERSION from version.js" >&2
  exit 1
fi
if [[ "$OLD" == "$NEW" ]]; then
  echo "Already at $NEW" >&2
  exit 1
fi

perl -pi -e "s/\Q$OLD\E/$NEW/g" \
  "$ROOT/version.js" \
  "$ROOT/sw.js" \
  "$ROOT/manifest.webmanifest" \
  "$ROOT/index.html"

echo "Bumped $OLD → $NEW"
echo "Commit and deploy so clients pick up the new service worker."
