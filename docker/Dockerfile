# 阶段一：构建 Go 应用
FROM golang:alpine3.23 AS go-builder

WORKDIR /build

# 安装必要的构建依赖（CGO 需要，因为使用了 SQLite）
RUN apk add --no-cache \
    git \
    gcc \
    musl-dev \
    sqlite-dev

# 复制 go mod 文件
COPY go.mod go.sum ./

# 下载依赖
RUN go mod download

# 复制源代码
COPY . .

# 构建 Go 应用（启用 CGO，在 Alpine 下使用动态链接）
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o bin/webpanel ./cmd/webpanel

# 阶段二：构建前端
FROM node:20-alpine3.23 AS frontend-builder

WORKDIR /build

# 安装 pnpm
RUN npm install -g pnpm

# 复制前端 package.json（先复制依赖文件以利用缓存）
COPY internal/frontend/package.json ./

# 安装依赖（如果存在 pnpm-lock.yaml 会使用它）
COPY internal/frontend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

# 复制前端源代码
COPY internal/frontend/ ./

# 构建前端（临时修改输出目录为 ./dist，因为 vite.config.js 配置的是 ../../web/dist）
RUN sed -i 's|outDir:.*|outDir: "./dist",|' vite.config.js && pnpm build

# 阶段三：最终镜像
FROM alpine:3.23

# 设置工作目录
WORKDIR /app

# 启用 community 仓库（chan_dongle 需要）
RUN echo "http://dl-cdn.alpinelinux.org/alpine/v3.23/community" >> /etc/apk/repositories

# 更新 apk 索引
RUN apk update

# 安装基础依赖（所有架构都支持）
RUN apk add --no-cache \
    supervisor \
    ca-certificates \
    libusb \
    sqlite \
    bash \
    curl

# 安装 Asterisk（所有架构都支持）
RUN apk add --no-cache asterisk asterisk-dev || \
    (echo "Warning: asterisk may not be available for this architecture" && exit 1)

# 尝试安装 asterisk-chan-dongle（仅在支持的架构上，如 amd64）
# 如果失败则跳过（ARM64 架构不支持）
RUN apk add --no-cache asterisk-chan-dongle 2>/dev/null || \
    echo "Warning: asterisk-chan-dongle not available for this architecture, skipping..."

# 从 Go 构建阶段复制二进制文件
COPY --from=go-builder /build/bin/webpanel /app/bin/webpanel

# 从前端构建阶段复制构建产物
COPY --from=frontend-builder /build/dist /app/web/dist

# 复制配置文件
COPY configs/asterisk/ /app/configs/asterisk/
COPY configs/supervisor/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# 复制启动脚本
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 创建必要的目录
RUN mkdir -p /var/lib/lzc-mobile \
    /etc/asterisk \
    /var/log/asterisk \
    /var/run/asterisk \
    /var/log/supervisor

# 暴露端口
# SIP TCP 端口（默认 5060）
EXPOSE 5060/tcp
# RTP UDP 端口范围（默认 40890-40900）
EXPOSE 40890-40900/udp
# Web 管理端口（默认 8071）
EXPOSE 8071/tcp

# 设置环境变量
ENV WEB_PORT=8071
ENV DB_PATH=/var/lib/lzc-mobile/data.db
ENV ASTERISK_CONFIG_DIR=/etc/asterisk
ENV ASTERISK_TEMPLATE_DIR=/app/configs/asterisk
ENV ASTERISK_LOG_PATH=/var/log/asterisk/full

# 启动脚本
ENTRYPOINT ["/entrypoint.sh"]
