#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec /bin/zsh -lic "cd \"$SCRIPT_DIR\" && chmod +x ./dev.sh && ./dev.sh"
