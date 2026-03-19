#!/bin/bash
# 短信接收失败诊断脚本
# 使用方法: ssh root@ecat.heiyu.space "bash -s" < scripts/diagnose-sms-receive.sh

set -e

CONTAINER_NAME="inkakawaety001lzcmobile-lzcmobile-1"

echo "========================================"
echo "短信接收失败诊断脚本"
echo "========================================"
echo ""

echo "1. 检查容器状态..."
lzc-docker ps | grep lzcmobile || { echo "容器未运行!"; exit 1; }
echo ""

echo "2. 查看 Asterisk 短信接收日志 (最近 50 条)..."
lzc-docker logs $CONTAINER_NAME 2>&1 | grep -E "(Incoming SMS|sms\.txt|quectel.*sms|curl.*sms/receive)" | tail -50 || echo "未找到相关日志"
echo ""

echo "3. 查看 API 请求日志..."
lzc-docker logs $CONTAINER_NAME 2>&1 | grep -E "POST.*sms/receive|SMS queued|Processing SMS|receiveSMS" | tail -30 || echo "未找到 API 日志"
echo ""

echo "4. 查看 SMS handler 错误..."
lzc-docker logs $CONTAINER_NAME 2>&1 | grep -iE "error.*sms|failed.*sms|warning.*sms|queue.*full" | tail -20 || echo "未找到错误日志"
echo ""

echo "5. 检查 sms.txt 日志文件 (Asterisk 级别)..."
lzc-docker exec $CONTAINER_NAME tail -20 /var/log/asterisk/sms.txt 2>/dev/null || echo "sms.txt 不存在或无内容"
echo ""

echo "6. 检查数据库中的短信记录 (最近 10 条)..."
lzc-docker exec $CONTAINER_NAME sqlite3 /var/lib/lzc-mobile/data.db "SELECT id, dongle_id, phone_number, substr(content,1,30), direction, created_at FROM sms_messages ORDER BY created_at DESC LIMIT 10" || echo "无法查询数据库"
echo ""

echo "7. 查看 Quectel 设备状态..."
lzc-docker exec $CONTAINER_NAME asterisk -rx 'quectel show device state quectel0' 2>/dev/null || echo "无法获取设备状态"
echo ""

echo "8. 检查 AMI 连接状态..."
lzc-docker logs $CONTAINER_NAME 2>&1 | grep -E "AMI.*connected|AMI.*disconnected|Manager client" | tail -10 || echo "未找到 AMI 日志"
echo ""

echo "9. 测试 API 端点是否响应..."
lzc-docker exec $CONTAINER_NAME curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:8071/api/v1/system/status || echo "API 无法访问"
echo ""

echo "10. 查看 Asterisk 完整日志中最近的 ERROR..."
lzc-docker logs $CONTAINER_NAME 2>&1 | grep -i "error\|warning" | grep -v "SecurityEvent" | tail -20 || echo "未找到错误日志"
echo ""

echo "========================================"
echo "诊断完成"
echo "========================================"
