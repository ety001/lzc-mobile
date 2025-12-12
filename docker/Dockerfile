# 使用 Debian 作为基础镜像
FROM debian:bookworm-slim

# 设置工作目录
WORKDIR /app

# 安装必要的系统依赖
RUN apt-get update && apt-get install -y \
    build-essential \
    wget \
    curl \
    git \
    supervisor \
    asterisk \
    asterisk-dev \
    libusb-1.0-0-dev \
    libusb-1.0-0 \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# 安装 Go
ENV GO_VERSION=1.25.5
RUN wget -q https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz \
    && rm go${GO_VERSION}.linux-amd64.tar.gz

# 设置 Go 环境变量
ENV PATH=$PATH:/usr/local/go/bin
ENV GOPATH=/go
ENV GOPROXY=https://proxy.golang.org,direct

# 安装 Node.js 和 pnpm（用于构建前端）
ENV NODE_VERSION=20
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm \
    && rm -rf /var/lib/apt/lists/*

# 复制项目文件
COPY . .

# 构建 Go 应用
RUN go mod download \
    && go build -o bin/webpanel ./cmd/webpanel

# 构建前端
WORKDIR /app/internal/frontend
RUN pnpm install \
    && pnpm build

# 回到工作目录
WORKDIR /app

# 创建必要的目录
RUN mkdir -p /var/lib/lzc-mobile \
    /etc/asterisk \
    /var/log/asterisk \
    /var/run/asterisk \
    web/dist

# 复制 Supervisor 配置
COPY configs/supervisor/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# 复制启动脚本
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

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
