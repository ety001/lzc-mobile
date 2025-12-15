#!/bin/bash
set -euo pipefail

# 本地 OIDC Mock 服务器快速启停脚本
# 使用 Docker Hub 上的 ety001/lzc-mock-oidc 镜像
#
# 环境变量：
#   OIDC_IMAGE                镜像（默认 ety001/lzc-mock-oidc:latest）
#   OIDC_CONTAINER_NAME       容器名（默认 lzc-oidc-dev）
#   OIDC_HOST_PORT            映射到宿主的端口（默认 8080）
#   OIDC_CLIENT_ID           客户端 ID（默认 test-client）
#   OIDC_CLIENT_SECRET        客户端密钥（默认 test-secret）
#
# 用法：
#   ./scripts/oidc-dev.sh start    启动本地 OIDC Mock（自动从 Docker Hub 拉取）
#   ./scripts/oidc-dev.sh stop     停止并删除容器
#   ./scripts/oidc-dev.sh status   查看容器状态
#   ./scripts/oidc-dev.sh logs     查看/跟随日志

CONTAINER="${OIDC_CONTAINER_NAME:-lzc-oidc-dev}"
HOST_PORT="${OIDC_HOST_PORT:-8080}"
IMAGE="${OIDC_IMAGE:-ety001/lzc-mock-oidc:latest}"

usage() {
  echo "Usage: $0 {start|stop|status|logs}"
  echo "  start   - 启动本地 OIDC Mock 服务器（自动从 Docker Hub 拉取镜像）"
  echo "  stop    - 停止并删除容器"
  echo "  status  - 查看容器状态"
  echo "  logs    - 查看/跟随日志"
  exit 1
}

action="${1:-}"
case "$action" in
  start|stop|status|logs) ;;
  *) usage ;;
esac

is_running() {
  docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"
}

container_exists() {
  docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"
}

case "$action" in
  start)
    if is_running; then
      echo "Container '${CONTAINER}' is already running."
      exit 0
    fi

    if container_exists; then
      echo "Found existing container '${CONTAINER}', removing..."
      docker rm -f "${CONTAINER}" >/dev/null
    fi

    # 检查镜像是否存在，不存在则从 Docker Hub 拉取
    if ! docker image inspect "${IMAGE}" >/dev/null 2>&1; then
      echo "Image ${IMAGE} not found. Pulling from Docker Hub..."
      docker pull "${IMAGE}"
    fi

    echo "Starting local OIDC Mock server..."
    docker run -d \
      --name "${CONTAINER}" \
      -p "${HOST_PORT}:8080" \
      -e OIDC_PORT=8080 \
      -e OIDC_ISSUER="http://localhost:${HOST_PORT}" \
      -e OIDC_CLIENT_ID="${OIDC_CLIENT_ID:-test-client}" \
      -e OIDC_CLIENT_SECRET="${OIDC_CLIENT_SECRET:-test-secret}" \
      "${IMAGE}"

    echo "✓ Started local OIDC Mock on http://localhost:${HOST_PORT}"
    echo "  Issuer: http://localhost:${HOST_PORT}"
    echo ""
    echo "  Suggested env for lzc-mobile:"
    echo "    LAZYCAT_AUTH_OIDC_CLIENT_ID=${OIDC_CLIENT_ID:-test-client}"
    echo "    LAZYCAT_AUTH_OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET:-test-secret}"
    echo "    LAZYCAT_AUTH_OIDC_AUTH_URI=http://localhost:${HOST_PORT}/authorize"
    echo "    LAZYCAT_AUTH_OIDC_TOKEN_URI=http://localhost:${HOST_PORT}/token"
    echo "    LAZYCAT_AUTH_OIDC_USERINFO_URI=http://localhost:${HOST_PORT}/userinfo"
    echo "    LAZYCAT_AUTH_BASE_URL=http://localhost:8071"
    echo "    LAZYCAT_AUTH_OIDC_REDIRECT_URI=/auth/oidc/callback"
    echo ""
    echo "  Well-known: http://localhost:${HOST_PORT}/.well-known/openid-configuration"
    ;;

  stop)
    if container_exists; then
      docker rm -f "${CONTAINER}" >/dev/null
      echo "Stopped and removed '${CONTAINER}'."
    else
      echo "Container '${CONTAINER}' not found."
    fi
    ;;

  status)
    if is_running; then
      echo "'${CONTAINER}' is running (port ${HOST_PORT} -> 8080)."
      docker ps --filter "name=${CONTAINER}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    elif container_exists; then
      echo "'${CONTAINER}' exists but is not running."
      docker ps -a --filter "name=${CONTAINER}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    else
      echo "Container '${CONTAINER}' does not exist."
    fi
    ;;

  logs)
    if container_exists; then
      docker logs -f "${CONTAINER}"
    else
      echo "Container '${CONTAINER}' not found."
      exit 1
    fi
    ;;
esac
