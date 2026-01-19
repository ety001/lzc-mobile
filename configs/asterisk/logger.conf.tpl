[general]
; 自动加载日志配置
autoload=yes

; 创建日志子目录
dateformat=%F %T

[logfiles]
; 配置 messages 日志文件
messages => notice,warning,error
; 配置 full 日志文件（包含调试信息）
full => notice,warning,error,debug,verbose,dtmf,fax

[logchannels]
; 控制台日志通道
console => notice,warning,error

; 安全日志通道
security => security
