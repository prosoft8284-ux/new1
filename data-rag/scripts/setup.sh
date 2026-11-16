#!/usr/bin/env bash
# Idempotent setup: safe to run after every machine restart, does nothing if ready.
#
#   bash scripts/setup.sh           # create/repair .venv, install deps, check tesseract
#   bash scripts/setup.sh --force   # recreate .venv from scratch
#
# Uses `uv` when it is installed (a fresh install takes seconds instead of a
# minute), otherwise plain pip. Verifies imports before reporting success so a
# half-finished install cannot look like a working one.
set -euo pipefail
cd "$(dirname "$0")/.."

PY="${PYTHON:-python3}"
FORCE="${1:-}"

if [ ! -x .venv/bin/python ] || [ "$FORCE" = "--force" ]; then
  echo "==> creating .venv"
  rm -rf .venv
  "$PY" -m venv .venv
fi

if command -v uv >/dev/null 2>&1; then
  echo "==> installing dependencies with uv (fast path)"
  uv pip install --python .venv/bin/python -q -r requirements.txt
else
  echo "==> installing dependencies with pip"
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt
fi

.venv/bin/python - <<'PY'
import importlib, sys
missing = []
for name in ("duckdb", "lancedb", "pyarrow", "pymupdf", "numpy"):
    try:
        importlib.import_module(name)
    except Exception as exc:
        missing.append(f"{name} ({exc})")
if missing:
    sys.exit("missing: " + ", ".join(missing))
print("deps ok")
PY

if [ ! -x "$HOME/tools/squashfs-root/AppRun" ] && [ -z "${TESSDATA_PREFIX:-}" ]; then
  echo "==> installing portable tesseract into ~/tools"
  bash setup_tesseract.sh
else
  echo "tesseract: $("$HOME/tools/squashfs-root/AppRun" --version 2>/dev/null | head -1 || echo 'found via TESSERACT_CMD')"
fi

echo "==> tests"
.venv/bin/python -m unittest discover -s tests -q
echo
echo "ready: .venv/bin/python -m rag status"
