[general]
; 自动加载日志配置
autoload=yes

; 创建日志子目录
dateformat=%F %T

[logfiles]
; 配置日志输出到标准输出（包含所有调试信息）
; 使用绝对路径 /dev/stdout 输出到 Docker 日志驱动
/dev/stdout => notice,warning,error,debug,verbose,dtmf,fax

[logchannels]
; 控制台日志通道
; console => notice,warning,error

; 安全日志通道
security => security
