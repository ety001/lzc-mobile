[general]
; 自动加载日志配置
autoload=yes

[logfiles]
; 配置 messages 日志文件
messages.log => {
    ; 当日志文件达到 10MB 时进行轮转
    rotate = 10000000

    ; 保留最近 5 个轮转文件
    max_log_files = 5

    ; 使用标准时间戳格式
    format = \"%{timestamp} [%{category}] %{message}:%{lineno}\"
}

; 配置 full 日志文件（如果使用）
; full => {
;     rotate = 10000000
;     max_log_files = 5
;     format = \"%{timestamp} [%{category}] %{message}:%{lineno}\"
; }

[logchannels]
; 控制台日志通道
console => {
    ; 继承全局设置
}

; 安全日志通道
security => {
    ; 继承全局设置
}
