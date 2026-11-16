#!/usr/bin/env bash
# Run the whole library and keep going until nothing is left.
#
#   bash scripts/ocr-all.sh                 # every PDF in books/, default options
#   bash scripts/ocr-all.sh books --model best
#
# Why this exists: a long OCR run gets killed (machine restart, timeout, an
# evicted machine), and a single `library` call then stops with work left. This
# loop restarts it — the page cache and manifest make each restart cheap — until
# `rag status` reports no pending books. Progress goes to data/library.log, and
# `python -m rag status` shows where it is without reading that log.
set -uo pipefail
cd "$(dirname "$0")/.."

DIR="${1:-books}"
shift || true
LOG="${LOG:-data/library.log}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-50}"
RETRY_SLEEP="${RETRY_SLEEP:-5}"

mkdir -p data
attempt=0
while :; do
  attempt=$((attempt + 1))
  printf '=== attempt %d at %s ===\n' "$attempt" "$(date -Is)" >>"$LOG"
  .venv/bin/python -m rag library --dir "$DIR" "$@" >>"$LOG" 2>&1
  code=$?

  read -r pending failed <<<"$(.venv/bin/python -m rag status | .venv/bin/python -c \
    'import json,sys; d=json.load(sys.stdin); print(d["progress"].get("remaining") or 0, d["progress"].get("failed") or 0)')"
  printf 'exit=%s pending=%s failed=%s\n' "$code" "$pending" "$failed" >>"$LOG"
  echo "[ocr-all] attempt=$attempt exit=$code pending=$pending failed=$failed"

  if [ "$pending" -eq 0 ]; then
    echo "[ocr-all] done — see $LOG"
    break
  fi
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ] || [ "$code" -ne 0 ] && [ "$pending" -eq 0 ]; then
    echo "[ocr-all] stopped after $attempt attempts; $pending books still pending"
    break
  fi
  sleep "$RETRY_SLEEP"
done
