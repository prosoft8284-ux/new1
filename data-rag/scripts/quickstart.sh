#!/usr/bin/env bash
# One command to get back to a working state: env, library status, next step.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -x .venv/bin/python ]; then
  echo "→ محیط پایتون نبود؛ می‌سازم (حدود ۵ ثانیه با uv)"
  bash scripts/setup.sh
fi

echo
echo "— ایندکس —"
.venv/bin/python -m rag stats 2>/dev/null || echo "هنوز ایندکسی ساخته نشده"

echo
echo "— کتابخانه (PDF → OCR → ایندکس) —"
.venv/bin/python -m rag status 2>/dev/null | head -12 || true

echo
echo "— ابزارهای اختیاری —"
if command -v agent-reach >/dev/null 2>&1 || [ -x "$HOME/.local/bin/agent-reach" ]; then
  echo "agent-reach: نصب است ✓"
else
  echo "agent-reach: نیست — برای جست‌وجوی وب: bash scripts/install-agent-reach.sh"
fi
if [ -n "${TESSDATA_PREFIX:-}" ]; then
  echo "TESSDATA_PREFIX: $TESSDATA_PREFIX ✓"
else
  echo "TESSDATA_PREFIX: ست نشده (OCR با مدل همراه پروژه کار می‌کند)"
fi

echo
echo "قدم بعدی — یکی از این‌ها:"
echo "  .venv/bin/python -m rag search \"عدالت\" -k 3"
echo "  .venv/bin/python -m rag fetch --query \"بوستان سعدی\" --lang fa --limit 5"
echo "  .venv/bin/python -m rag ganjoor --poet \"حافظ\" --index"
echo
echo "راهنمای کامل: data-rag/START-HERE.md"
