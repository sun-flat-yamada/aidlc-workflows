#!/usr/bin/env bash
# upstream-checks.sh — upstream（awslabs/aidlc-workflows）自身の検査を、fork の品質ゲート用に段ごとに走らせる
#
# 使い方:
#   dev/upstream-checks.sh [log-dir]
#     カレントディレクトリ（リポジトリのルート）で次の段を順に走らせ、段ごとに 1 行
#     「STEP <名前> PASS|FAIL」を標準出力に出す。詳細ログは <log-dir>/<名前>.log（既定 ./tmp/upstream-checks）。
#       install  bun install --frozen-lockfile
#       check    bun run check（package の決定性・3 つの tsconfig の型検査・Biome）
#       smoke    bash tests/run-tests.sh --smoke --no-llm（upstream の PR CI の Linux smoke と同じ層）
#     install が落ちたら以降は走らせない（FAIL として出す）。
#
# 終了コード: 0=全段 PASS 1=どれかが FAIL 2=使い方の誤り
# 段の名前と出力形式は .github/workflows/quality-gate.yml が base との比較に使う（変えるなら両方を直す）。
set -uo pipefail

LOG_DIR=${1:-tmp/upstream-checks}
[ -f package.json ] && [ -d tests ] || { echo "ERROR: aidlc-workflows のルートで実行してください" >&2; exit 2; }
mkdir -p "$LOG_DIR"
LOG_DIR=$(cd "$LOG_DIR" && pwd)
SMOKE_PARALLEL=${SMOKE_PARALLEL:-8}
SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-5400}

rc=0
run_step() {
  local name=$1; shift
  if "$@" >"$LOG_DIR/$name.log" 2>&1; then echo "STEP $name PASS"
  else echo "STEP $name FAIL"; rc=1; return 1; fi
}

if run_step install bun install --frozen-lockfile; then
  run_step check bun run check || true
  run_step smoke bash tests/run-tests.sh -P "$SMOKE_PARALLEL" --no-llm --smoke --run-timeout "$SMOKE_TIMEOUT" || true
else
  echo "STEP check FAIL"
  echo "STEP smoke FAIL"
fi
exit "$rc"
