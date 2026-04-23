#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PID=""
FRONTEND_PID=""

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令: $1"
    exit 1
  fi
}

cleanup() {
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

require_cmd python3
require_cmd npm

if [ ! -f "$ROOT_DIR/.env" ] && [ -f "$ROOT_DIR/.env.example" ]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo "已创建 .env（来自 .env.example）"
fi

# 优先使用系统环境变量；为 dashscope 场景做变量兜底映射。
if [ -z "${LLM_API_KEY:-}" ] && [ -n "${DASHSCOPE_API_KEY:-}" ]; then
  export LLM_API_KEY="$DASHSCOPE_API_KEY"
fi
if [ -z "${DASHSCOPE_API_KEY:-}" ] && [ -n "${LLM_API_KEY:-}" ]; then
  export DASHSCOPE_API_KEY="$LLM_API_KEY"
fi

if [ -z "${LLM_API_KEY:-}" ] && [ -z "${DASHSCOPE_API_KEY:-}" ]; then
  echo "未检测到 LLM API Key。"
  echo "请先在系统环境变量中 export LLM_API_KEY 或 DASHSCOPE_API_KEY。"
  exit 1
fi

if [ ! -d "$BACKEND_DIR/.venv" ]; then
  python3 -m venv "$BACKEND_DIR/.venv"
  echo "已创建后端虚拟环境: backend/.venv"
fi

"$BACKEND_DIR/.venv/bin/python" -m pip install --disable-pip-version-check -r "$BACKEND_DIR/requirements.txt" >/dev/null
echo "后端依赖已就绪"

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  npm --prefix "$FRONTEND_DIR" install >/dev/null
  echo "前端依赖已安装"
else
  echo "前端依赖已就绪"
fi

# 清理 .next 缓存防止 webpack 模块损坏（这是前端白屏的最常见根因）
if [ -d "$FRONTEND_DIR/.next" ]; then
  rm -rf "$FRONTEND_DIR/.next"
  echo "已清理前端构建缓存 (.next)"
fi

(
  cd "$BACKEND_DIR"
  "$BACKEND_DIR/.venv/bin/python" -m uvicorn app.main:app --reload --port 8000
) &
BACKEND_PID=$!
echo "后端启动中: http://localhost:8000"

(
  cd "$FRONTEND_DIR"
  npm run dev
) &
FRONTEND_PID=$!
echo "前端启动中: http://localhost:3000"

echo "按 Ctrl+C 停止全部服务"
wait
