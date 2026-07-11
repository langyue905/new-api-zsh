#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

version="$(tr -d '[:space:]' < UPSTREAM_VERSION)"
if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.]+)?$ ]]; then
  echo "invalid UPSTREAM_VERSION: $version" >&2
  exit 1
fi

for forbidden in \
  .github/workflows/docker-build.yml \
  .github/workflows/docker-image-branch.yml \
  .github/workflows/electron-build.yml \
  .github/workflows/release.yml \
  .github/workflows/pr-check.yml; do
  if [[ -e "$forbidden" ]]; then
    echo "forbidden upstream workflow remains: $forbidden" >&2
    exit 1
  fi
done

if grep -R --line-number --fixed-strings 'calciumion/new-api' .github/workflows 2>/dev/null; then
  echo 'custom workflows must not publish to calciumion/new-api' >&2
  exit 1
fi

echo "foundation guard passed for $version"
