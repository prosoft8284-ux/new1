#!/usr/bin/env bash
# (Re)install Agent Reach, which `rag fetch --source web` uses for open-web search.
#
# The binary lives under the home directory, so a fresh runner may not have it.
# Run this once after a restart; it is idempotent.
set -euo pipefail

VERSION="${AGENT_REACH_VERSION:-v1.6.1}"
URL="https://github.com/Panniantong/Agent-Reach/releases/download/${VERSION}/agent-reach.zip"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv لازم است: curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  exit 1
fi

echo "→ نصب Agent Reach ${VERSION} از گیت‌هاب"
uv tool install --force "$URL" >/dev/null

export PATH="$HOME/.local/bin:$PATH"
if ! grep -q '.local/bin' "$HOME/.bashrc" 2>/dev/null; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
fi

echo "→ setup کانال‌های پیش‌فرض"
agent-reach setup >/dev/null

echo -n "ok: "
agent-reach doctor --text | head -1
echo "تست: agent-reach web search \"بوستان سعدی pdf\" --limit 2"
