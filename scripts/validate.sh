#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required_files=(
  "CLAUDE.md"
  ".claude/settings.json"
  ".claude/agents/ruankao-architect.md"
  "state/profile.json"
  "state/progress.json"
  "state/current.md"
  "state/mistakes.json"
  "state/attempts.json"
  "state/review-plan.json"
  "materials/sources.json"
)

for relative_path in "${required_files[@]}"; do
  test -f "$project_dir/$relative_path" || {
    echo "missing: $relative_path" >&2
    exit 1
  }
done

for json_file in \
  "$project_dir/.claude/settings.json" \
  "$project_dir/state/profile.json" \
  "$project_dir/state/progress.json" \
  "$project_dir/state/mistakes.json" \
  "$project_dir/state/attempts.json" \
  "$project_dir/state/review-plan.json" \
  "$project_dir/materials/sources.json"; do
  jq empty "$json_file"
done

test "$(jq -r '.phase' "$project_dir/state/progress.json")" != "setup"
test "$(jq -r '.schema_version' "$project_dir/state/review-plan.json")" = "2"
test "$(jq -r '.preferences.practice_source' "$project_dir/state/profile.json")" = "优先可核验真题；仅在用户要求时生成模拟题"

echo "validation passed"
