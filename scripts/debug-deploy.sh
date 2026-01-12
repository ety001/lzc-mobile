#!/bin/bash
# lzc-mobile 联调部署脚本
# 用于在本地构建镜像后，在 nuc 服务器上拉取并重启容器

set -e

NUC_HOST="ety001@192.168.199.11"
CONTAINER_NAME="lzc-mobile"
IMAGE_NAME="ety001/lzc-mobile:latest"

echo "=== lzc-mobile 联调部署 ==="
echo ""

# 1. 构建并推送镜像
echo "步骤 1: 构建并推送 Docker 镜像..."
cd "$(dirname "$0")/.."
docker build --push -t "$IMAGE_NAME" -f docker/Dockerfile . || {
    echo "❌ 镜像构建失败"
    exit 1
}
echo "✅ 镜像构建并推送成功"
echo ""

# 2. 在 nuc 上拉取最新镜像
echo "步骤 2: 在 nuc 服务器上拉取最新镜像..."
ssh "$NUC_HOST" "docker pull $IMAGE_NAME" || {
    echo "❌ 镜像拉取失败"
    exit 1
}
echo "✅ 镜像拉取成功"
echo ""

# 3. 停止并删除旧容器
echo "步骤 3: 停止并删除旧容器..."
ssh "$NUC_HOST" "/data/server-conf/app/lzc-mobile/stop.sh" || {
    echo "⚠️  停止旧容器时出现错误（可能容器不存在）"
}
echo "✅ 旧容器已清理"
echo ""

# 4. 启动新容器
echo "步骤 4: 启动新容器..."
ssh "$NUC_HOST" "/data/server-conf/app/lzc-mobile/run.sh" || {
    echo "❌ 容器启动失败"
    exit 1
}
echo "✅ 容器启动成功"
echo ""

# 5. 等待容器启动
echo "步骤 5: 等待容器启动（10秒）..."
sleep 10

# 6. 检查容器状态
echo "步骤 6: 检查容器状态..."
ssh "$NUC_HOST" "docker ps | grep $CONTAINER_NAME" || {
    echo "⚠️  容器未运行"
}

# 7. 查看容器日志（最后 30 行）
echo ""
echo "步骤 7: 查看容器日志（最后 30 行）..."
ssh "$NUC_HOST" "docker logs --tail 30 $CONTAINER_NAME 2>&1" || {
    echo "⚠️  无法获取容器日志"
}

echo ""
echo "=== 部署完成 ==="
echo "容器访问地址: http://192.168.199.11:8071"
