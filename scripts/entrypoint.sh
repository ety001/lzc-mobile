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

# 设置默认值（如果未提供）
export ASTERISK_AMI_HOST="${ASTERISK_AMI_HOST:-localhost}"
export ASTERISK_AMI_PORT="${ASTERISK_AMI_PORT:-5038}"
export LAZYCAT_AUTH_OIDC_REDIRECT_URI="${LAZYCAT_AUTH_OIDC_REDIRECT_URI:-/auth/oidc/callback}"
# LAZYCAT_AUTH_BASE_URL 应该从环境变量或请求头中获取，不再设置默认值
# 如果未设置，代码会尝试从请求头自动检测
# export LAZYCAT_AUTH_BASE_URL="${LAZYCAT_AUTH_BASE_URL:-http://localhost:8071}"

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

# 修复设备权限函数
# 修复 ttyUSB 设备权限，确保 asterisk 用户可以访问
# 参考 debian11 环境中的 /etc/init.d/asterisk 脚本逻辑
fix_device_permissions() {
    # 修复 ttyUSB 设备权限
    for device in /dev/ttyUSB*; do
        if [ -e "$device" ]; then
            chgrp dialout "$device" 2>/dev/null || true
            chmod 660 "$device" 2>/dev/null || true
        fi
    done

    # 修复 ALSA 音频设备权限，确保 asterisk 用户可以访问
    if [ -d /dev/snd ]; then
        chgrp -R audio /dev/snd/* 2>/dev/null || true
        chmod -R g+rw /dev/snd/* 2>/dev/null || true
    fi
}

# 检查 ALSA 设备函数（用于诊断）
check_alsa_devices() {
    echo "检查 ALSA 设备..."

    # 检查 /proc/asound/cards
    if [ -f /proc/asound/cards ]; then
        echo "可用的 ALSA 卡片："
        cat /proc/asound/cards
        echo ""

        # 检查是否有 Android 设备
        if grep -q "Android" /proc/asound/cards; then
            echo "✓ 找到 Android 音频设备"
            ANDROID_CARD=$(grep -i "Android" /proc/asound/cards | awk '{print $1}')
            echo "  Android 设备卡片号: $ANDROID_CARD"
            echo "  可以使用: hw:$ANDROID_CARD,0 或 hw:CARD=Android,DEV=0"
        else
            echo "✗ 未找到 Android 音频设备"
        fi
    else
        echo "✗ /proc/asound/cards 不存在"
        echo "  提示: 需要使用 --privileged 模式或挂载 /proc"
    fi

    # 检查 /dev/snd 设备
    if [ -d /dev/snd ]; then
        echo ""
        echo "ALSA 设备文件："
        ls -l /dev/snd/ | head -10
    else
        echo "✗ /dev/snd 目录不存在"
        echo "  提示: 需要使用 --device=/dev/snd 挂载 ALSA 设备"
    fi

    # 尝试列出播放设备
    echo ""
    echo "尝试列出播放设备："
    aplay -l 2>&1 || echo "无法列出设备（可能需要权限）"
}

# 修复设备权限
fix_device_permissions

# 如果设置了 CHECK_ALSA 环境变量，则检查 ALSA 设备
if [ "${CHECK_ALSA:-}" = "1" ] || [ "${CHECK_ALSA:-}" = "true" ]; then
    check_alsa_devices
    echo ""
fi

# 初始化 Asterisk 配置（如果不存在）
if [ ! -f /etc/asterisk/asterisk.conf ]; then
    echo "Initializing Asterisk configuration..."
    # 这里可以添加默认的 Asterisk 配置文件
    # 或者让 Go 程序首次运行时生成
fi

# 启动 Supervisor（会管理 Asterisk 和 Web 面板）
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
