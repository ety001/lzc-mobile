#!/bin/sh
set -e

# 检查必要的环境变量
if [ -z "$LAZYCAT_AUTH_OIDC_CLIENT_ID" ]; then
    echo "Error: LAZYCAT_AUTH_OIDC_CLIENT_ID environment variable is required"
    exit 1
fi

if [ -z "$LAZYCAT_AUTH_OIDC_CLIENT_SECRET" ]; then
    echo "Error: LAZYCAT_AUTH_OIDC_CLIENT_SECRET environment variable is required"
    exit 1
fi

if [ -z "$ASTERISK_AMI_USERNAME" ]; then
    echo "Error: ASTERISK_AMI_USERNAME environment variable is required"
    exit 1
fi

if [ -z "$ASTERISK_AMI_PASSWORD" ]; then
    echo "Error: ASTERISK_AMI_PASSWORD environment variable is required"
    exit 1
fi

# 创建必要的目录
mkdir -p /var/lib/lzc-mobile
mkdir -p /var/log/asterisk
mkdir -p /var/log/supervisor
mkdir -p /var/run/asterisk
mkdir -p /etc/asterisk

# 设置权限
chmod 755 /var/lib/lzc-mobile
chmod 755 /var/log/asterisk
chmod 755 /var/run/asterisk
chmod 755 /etc/asterisk

# 初始化 Asterisk 配置（如果不存在）
if [ ! -f /etc/asterisk/asterisk.conf ]; then
    echo "Initializing Asterisk configuration..."
    # 这里可以添加默认的 Asterisk 配置文件
    # 或者让 Go 程序首次运行时生成
fi

# 启动 Supervisor（会管理 Asterisk 和 Web 面板）
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
