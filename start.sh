#!/usr/bin/env bash
set -euo pipefail

# 获取脚本所在目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

MODE="${1:-dev}"
PORTS_TO_FREE=()

print_usage() {
  cat <<'EOF'
Usage: ./start.sh [mode]

mode:
  dev         运行前后端开发模式（npm run dev）
  server-dev  仅启动后端开发监听（npm --workspace server run dev）
  client-dev  仅启动前端开发监听（npm --workspace client run dev）
  build       构建前后端（npm run build）
  start       启动生产模式后端（npm run start）
EOF
}

# 检查必要的依赖
check_dependencies() {
  echo "检查项目依赖..."
  
  if [[ ! -f "package.json" ]]; then
    echo "错误：找不到 package.json 文件" >&2
    exit 1
  fi

  if [[ ! -d "node_modules" ]]; then
    echo "依赖未安装，正在安装..."
    npm install
  fi

  # 检查 server/.env 文件
  if [[ ! -f "server/.env" ]]; then
    if [[ -f "env.sample" ]]; then
      echo "复制环境变量模板到 server/.env..."
      cp env.sample server/.env
      echo "请编辑 server/.env 文件配置 Azure Speech 服务密钥"
    else
      echo "警告：找不到 server/.env 文件，请确保已配置环境变量"
    fi
  fi
}

case "${MODE}" in
  dev)
    COMMAND=(npm run dev)
    PORTS_TO_FREE=(3001 5173)
    ;;
  server-dev)
    COMMAND=(npm --workspace server run dev)
    PORTS_TO_FREE=(3001)
    ;;
  client-dev)
    COMMAND=(npm --workspace client run dev)
    PORTS_TO_FREE=(5173)
    ;;
  build)
    COMMAND=(npm run build)
    PORTS_TO_FREE=()
    ;;
  start)
    COMMAND=(npm run start)
    PORTS_TO_FREE=(3001)
    ;;
  -h|--help|help)
    print_usage
    exit 0
    ;;
  *)
    echo "未知模式：${MODE}" >&2
    print_usage >&2
    exit 1
    ;;
esac

free_port() {
  local port=$1
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti tcp:"${port}" || true)
  elif command -v fuser >/dev/null 2>&1; then
    pids=$(fuser "${port}"/tcp 2>/dev/null || true)
  fi

  if [[ -n "${pids}" ]]; then
    echo "检测到端口 ${port} 被占用 (PID: ${pids})，尝试结束进程..."
    kill ${pids} 2>/dev/null || true
    sleep 1
    if command -v lsof >/dev/null 2>&1; then
      if lsof -ti tcp:"${port}" >/dev/null 2>&1; then
        echo "端口 ${port} 仍被占用，执行强制结束..."
        kill -9 ${pids} 2>/dev/null || true
      fi
    elif command -v fuser >/dev/null 2>&1; then
      if fuser "${port}"/tcp >/dev/null 2>&1; then
        echo "端口 ${port} 仍被占用，执行强制结束..."
        kill -9 ${pids} 2>/dev/null || true
      fi
    fi
  fi
}

# 执行依赖检查
if [[ "${MODE}" != "build" ]]; then
  check_dependencies
fi

# 释放端口
for port in "${PORTS_TO_FREE[@]:-}"; do
  free_port "${port}"
done

echo "执行命令：${COMMAND[*]}"

# 等待一下确保端口完全释放
if [[ ${#PORTS_TO_FREE[@]} -gt 0 ]]; then
  sleep 2
fi

child_pid=""
cleanup() {
  if [[ -n "${child_pid}" ]]; then
    echo "收到退出信号，正在停止运行..."
    kill "${child_pid}" 2>/dev/null || true
    # 级联结束由该进程衍生出的子进程
    pkill -P "${child_pid}" 2>/dev/null || true
    wait "${child_pid}" 2>/dev/null || true
  fi
}

trap cleanup SIGINT SIGTERM

"${COMMAND[@]}" &
child_pid=$!
wait "${child_pid}"
