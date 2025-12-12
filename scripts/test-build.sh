#!/bin/bash
set -e

# Docker 构建测试脚本
# 用于验证 Dockerfile 是否能正常构建

echo "=== LZC Mobile Docker 构建测试 ==="
echo ""

# 检查 Docker 是否可用
if ! command -v docker &> /dev/null; then
    echo "错误: Docker 未安装或不在 PATH 中"
    exit 1
fi

echo "✓ Docker 已安装"
echo ""

# 设置变量
IMAGE_NAME="lzc-mobile-test"
DOCKERFILE_PATH="docker/Dockerfile"
BUILD_CONTEXT="."

# 清理旧的测试镜像（如果存在）
echo "清理旧的测试镜像..."
docker rmi ${IMAGE_NAME}:test 2>/dev/null || true
echo ""

# 开始构建
echo "开始构建 Docker 镜像..."
echo "镜像名称: ${IMAGE_NAME}:test"
echo "Dockerfile: ${DOCKERFILE_PATH}"
echo "构建上下文: ${BUILD_CONTEXT}"
echo ""

# 构建镜像
if docker build \
    -f ${DOCKERFILE_PATH} \
    -t ${IMAGE_NAME}:test \
    ${BUILD_CONTEXT}; then
    echo ""
    echo "✓ 构建成功！"
    echo ""
    
    # 检查镜像大小
    echo "=== 镜像信息 ==="
    docker images ${IMAGE_NAME}:test --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
    echo ""
    
    # 检查镜像层
    echo "=== 镜像层信息 ==="
    docker history ${IMAGE_NAME}:test --format "table {{.CreatedBy}}\t{{.Size}}" | head -10
    echo ""
    
    # 验证关键文件是否存在（使用 /bin/sh 绕过 entrypoint 的环境变量检查）
    echo "=== 验证关键文件 ==="
    docker run --rm --entrypoint /bin/sh ${IMAGE_NAME}:test -c "ls -lh /app/bin/webpanel" 2>/dev/null && echo "✓ Go 二进制文件存在" || echo "✗ Go 二进制文件不存在"
    docker run --rm --entrypoint /bin/sh ${IMAGE_NAME}:test -c "test -d /app/web/dist && ls /app/web/dist" 2>/dev/null && echo "✓ 前端构建产物目录存在" || echo "✗ 前端构建产物目录不存在"
    docker run --rm --entrypoint /bin/sh ${IMAGE_NAME}:test -c "test -f /entrypoint.sh" 2>/dev/null && echo "✓ 启动脚本存在" || echo "✗ 启动脚本不存在"
    docker run --rm --entrypoint /bin/sh ${IMAGE_NAME}:test -c "test -d /app/configs/asterisk" 2>/dev/null && echo "✓ Asterisk 配置目录存在" || echo "✗ Asterisk 配置目录不存在"
    echo ""
    
    # 检查二进制文件信息
    echo "=== 二进制文件检查 ==="
    docker run --rm --entrypoint /bin/sh ${IMAGE_NAME}:test -c "ls -lh /app/bin/webpanel"
    docker run --rm --entrypoint /bin/sh ${IMAGE_NAME}:test -c "ldd /app/bin/webpanel 2>/dev/null | head -5 || echo '（动态链接库检查：可能需要 musl libc）'"
    echo ""
    
    echo "=== 构建测试完成 ==="
    echo ""
    echo "提示: 可以使用以下命令运行测试容器:"
    echo "  docker run --rm -it ${IMAGE_NAME}:test /bin/bash"
    echo ""
    echo "提示: 清理测试镜像:"
    echo "  docker rmi ${IMAGE_NAME}:test"
    
else
    echo ""
    echo "✗ 构建失败！"
    exit 1
fi
