#!/usr/bin/env bash
# 버전 3곳(package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml)을 한 번에 맞춘다.
# 파일만 고치고 커밋/태그는 하지 않는다 — 버전 커밋과 태그는 release 워크플로가 단독으로 만든다.
# (로컬에서 버전 커밋을 만들어 push하면 워크플로의 재트리거 가드에 걸려 릴리스가 나가지 않는다)
#
#   ./scripts/bump-version.sh 0.2.0             # 파일 3곳 수정
#   ./scripts/bump-version.sh 0.2.0 --dry-run   # 아무것도 바꾸지 않고 확인만
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${1:-}"
MODE="${2:---files-only}"

if [ -z "$VERSION" ]; then
  echo "사용법: $0 <버전> [--dry-run]    예) $0 0.2.0" >&2
  exit 1
fi

case "$MODE" in
  --files-only|--dry-run) ;;
  *) echo "알 수 없는 옵션: $MODE (--dry-run 만 지원)" >&2; exit 1 ;;
esac

if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "버전은 semver 형식이어야 합니다 (예: 0.2.0). 입력값: $VERSION" >&2
  exit 1
fi

CURRENT=$(jq -r .version package.json)
echo "$CURRENT → $VERSION"

if [ "$MODE" = "--dry-run" ]; then
  echo "(dry-run) 파일을 수정하지 않고 종료합니다."
  exit 0
fi

# package.json / tauri.conf.json — 최상위 version 키만 교체
tmp=$(mktemp)
jq --arg v "$VERSION" '.version = $v' package.json > "$tmp" && mv "$tmp" package.json
tmp=$(mktemp)
jq --arg v "$VERSION" '.version = $v' src-tauri/tauri.conf.json > "$tmp" && mv "$tmp" src-tauri/tauri.conf.json

# Cargo.toml — [package] 섹션의 첫 version 줄만 교체 (의존성 version은 건드리지 않음)
tmp=$(mktemp)
awk -v v="$VERSION" '
  /^\[package\]/ { inpkg = 1 }
  /^\[/ && !/^\[package\]/ { inpkg = 0 }
  inpkg && /^version *=/ && !done { print "version = \"" v "\""; done = 1; next }
  { print }
' src-tauri/Cargo.toml > "$tmp" && mv "$tmp" src-tauri/Cargo.toml

# Cargo.lock의 자기 패키지 버전도 갱신
if [ -f src-tauri/Cargo.lock ] && command -v cargo > /dev/null; then
  (cd src-tauri && cargo update --workspace --quiet 2>/dev/null) || true
fi

echo "파일 3곳(+Cargo.lock)을 $VERSION 로 수정했습니다."
