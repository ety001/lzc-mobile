#!/bin/bash
set -e

# 快速构建脚本
# 用于快速构建生产镜像

IMAGE_NAME="${IMAGE_NAME:-lzc-mobile}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DOCKERFILE_PATH="docker/Dockerfile"
BUILD_CONTEXT="."

echo "=== 构建 LZC Mobile Docker 镜像 ==="
echo "镜像名称: ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""

docker build \
    -f ${DOCKERFILE_PATH} \
    -t ${IMAGE_NAME}:${IMAGE_TAG} \
    ${BUILD_CONTEXT}

echo ""
echo "✓ 构建完成！"
echo ""
echo "镜像: ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "运行容器:"
echo "  docker run -d --name lzc-mobile \\"
echo "    --device=/dev/ttyUSB0 \\"
echo "    -p 8071:8071 \\"
echo "    -p 5060:5060/tcp \\"
echo "    -p 40890-40900:40890-40900/udp \\"
echo "    -e LAZYCAT_AUTH_OIDC_CLIENT_ID=... \\"
echo "    -e LAZYCAT_AUTH_OIDC_CLIENT_SECRET=... \\"
echo "    -e ASTERISK_AMI_USERNAME=admin \\"
echo "    -e ASTERISK_AMI_PASSWORD=... \\"
echo "    ${IMAGE_NAME}:${IMAGE_TAG}"
