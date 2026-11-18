#!/usr/bin/env bash
# 마지막 v* 태그 이후의 커밋을 읽어 다음 버전을 계산해 stdout으로 출력한다.
#
#   ./scripts/next-version.sh          # auto — 커밋 타입으로 판단
#   ./scripts/next-version.sh minor    # 강제 지정
#
# 판단 규칙 (Conventional Commits):
#   BREAKING CHANGE 또는 `타입!:`  → major  (단, 현재가 0.x면 minor — semver 0.x 관례)
#   feat:                          → minor
#   그 외 (fix/design/refactor/…)  → patch
set -euo pipefail

cd "$(dirname "$0")/.."

MODE="${1:-auto}"
CURRENT=$(jq -r .version package.json)
IFS=. read -r MAJOR MINOR PATCH <<< "$CURRENT"

LAST_TAG=$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  RANGE="$LAST_TAG..HEAD"
else
  RANGE="HEAD"
fi

if [ "$MODE" = "auto" ]; then
  SUBJECTS=$(git log "$RANGE" --no-merges --pretty=%s)
  BODIES=$(git log "$RANGE" --no-merges --pretty=%B)

  if echo "$BODIES" | grep -q '^BREAKING CHANGE' || echo "$SUBJECTS" | grep -qE '^[a-z]+(\([^)]*\))?!:'; then
    MODE=major
  elif echo "$SUBJECTS" | grep -qE '^feat(\([^)]*\))?:'; then
    MODE=minor
  else
    MODE=patch
  fi

  # 0.x 구간에서는 breaking을 major로 올리지 않는다 (0.1.0 → 1.0.0 사고 방지)
  if [ "$MODE" = "major" ] && [ "$MAJOR" = "0" ]; then
    MODE=minor
  fi
fi

case "$MODE" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
  *) echo "알 수 없는 모드: $MODE (auto|major|minor|patch)" >&2; exit 1 ;;
esac

NEXT="$MAJOR.$MINOR.$PATCH"

# 이미 존재하는 태그와 겹치면 patch를 밀어 올린다 (동시 push 경합 대비)
while git rev-parse -q --verify "refs/tags/v$NEXT" > /dev/null; do
  PATCH=$((PATCH + 1))
  NEXT="$MAJOR.$MINOR.$PATCH"
done

echo "$NEXT"
