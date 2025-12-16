#!/bin/bash
# 重启容器脚本 - 使用新构建的镜像
# 用法: ./scripts/restart-container.sh

set -e

CONTAINER_NAME="lzc-mobile"
IMAGE_NAME="lzc-mobile:latest"

echo "Stopping and removing existing container (if any)..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

echo "Starting new container from latest image..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --network host \
  -e LAZYCAT_AUTH_OIDC_CLIENT_ID="${LAZYCAT_AUTH_OIDC_CLIENT_ID:-test-client}" \
  -e LAZYCAT_AUTH_OIDC_CLIENT_SECRET="${LAZYCAT_AUTH_OIDC_CLIENT_SECRET:-test-secret}" \
  -e LAZYCAT_AUTH_OIDC_AUTH_URI="${LAZYCAT_AUTH_OIDC_AUTH_URI:-http://localhost:8080/authorize}" \
  -e LAZYCAT_AUTH_OIDC_TOKEN_URI="${LAZYCAT_AUTH_OIDC_TOKEN_URI:-http://localhost:8080/token}" \
  -e LAZYCAT_AUTH_OIDC_USERINFO_URI="${LAZYCAT_AUTH_OIDC_USERINFO_URI:-http://localhost:8080/userinfo}" \
  -e ASTERISK_AMI_USERNAME="${ASTERISK_AMI_USERNAME:-admin}" \
  -e ASTERISK_AMI_PASSWORD="${ASTERISK_AMI_PASSWORD:-123456}" \
  -e ASTERISK_AMI_HOST="${ASTERISK_AMI_HOST:-localhost}" \
  -e ASTERISK_AMI_PORT="${ASTERISK_AMI_PORT:-5038}" \
  "$IMAGE_NAME"

echo "Waiting for container to start..."
sleep 5

echo "Container status:"
docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "To view logs: docker logs -f $CONTAINER_NAME"
