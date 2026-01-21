[general]
static=yes
writeprotect=no
autofallthrough=yes
clearglobalvars=no
priorityjumping=no

[globals]
; 全局变量

[default]
; 默认上下文
; Extension 之间互相呼叫
{{range .Extensions}}
exten => {{.Username}},1,NoOp(Call from ${CALLERID(num)} to extension {{.Username}})
exten => {{.Username}},n,Dial(PJSIP/{{.Username}},30)
exten => {{.Username}},n,Hangup()
{{end}}

; 通用路由：尝试呼叫任何已注册的 PJSIP peer（用于未明确配置的 extension）
; 匹配单数字（0-9）
exten => X,1,NoOp(Attempting to call PJSIP peer: ${EXTEN})
exten => X,n,Dial(PJSIP/${EXTEN},30,tT)
exten => X,n,GotoIf($["${DIALSTATUS}" = "CHANUNAVAIL"]?error:hangup)
exten => X,n(hangup),Hangup()
exten => X,n(error),NoOp(Call failed: ${DIALSTATUS} - PJSIP peer ${EXTEN} not found or not registered)
exten => X,n,Hangup()
; 匹配任意数字（至少2位），尝试通过 PJSIP 呼叫
exten => _X.,1,NoOp(Attempting to call PJSIP peer: ${EXTEN})
exten => _X.,n,Dial(PJSIP/${EXTEN},30,tT)
exten => _X.,n,GotoIf($["${DIALSTATUS}" = "CHANUNAVAIL"]?error:hangup)
exten => _X.,n(hangup),Hangup()
exten => _X.,n(error),NoOp(Call failed: ${DIALSTATUS} - PJSIP peer ${EXTEN} not found or not registered)
exten => _X.,n,Hangup()

; Quectel 设备上下文：处理来电、短信、USSD
; 注意：Quectel 模块默认使用 incoming-mobile 上下文，我们也定义它以确保兼容
[incoming-mobile]
; 处理收到的短信
; 注意：Quectel 模块会通过 AMI 事件发送短信，这里记录到日志
exten => sms,1,Verbose(Incoming SMS from ${CALLERID(num)} on ${QUECTELNAME}: ${BASE64_DECODE(${SMS_BASE64})})
exten => sms,n,System(echo '${STRFTIME(${EPOCH},,%Y-%m-%d %H:%M:%S)} - ${QUECTELNAME} - ${CALLERID(num)}: ${BASE64_DECODE(${SMS_BASE64})}' >> /var/log/asterisk/sms.txt)
; 通过 AMI UserEvent 通知 Go 程序处理短信
; 使用 BASE64 编码避免特殊字符破坏 AMI 协议
exten => sms,n,UserEvent(SMSReceived,Device: ${QUECTELNAME},Sender: ${CALLERID(num)},MessageBase64: ${SMS_BASE64})
exten => sms,n,Hangup()

; 处理收到的 USSD
exten => ussd,1,Verbose(Incoming USSD on ${QUECTELNAME}: ${BASE64_DECODE(${USSD_BASE64})})
exten => ussd,n,System(echo '${STRFTIME(${EPOCH},,%Y-%m-%d %H:%M:%S)} - ${QUECTELNAME}: ${BASE64_DECODE(${USSD_BASE64})}' >> /var/log/asterisk/ussd.txt)
exten => ussd,n,Hangup()

; 处理来电：根据 QUECTELNAME 路由到绑定的 extension
exten => s,1,NoOp(Incoming call from quectel ${QUECTELNAME})
exten => s,n,GotoIf($["${QUECTELNAME}" = ""]?no-binding)
{{range .DongleBindings}}
{{if .Inbound}}
exten => s,n,GotoIf($["${QUECTELNAME}" = "{{.DongleID}}"]?binding-{{.DongleID}})
{{end}}
{{end}}
exten => s,n(no-binding),NoOp(No extension binding found for quectel ${QUECTELNAME})
exten => s,n,Hangup()
{{range .DongleBindings}}
{{if .Inbound}}
exten => s,n(binding-{{.DongleID}}),NoOp(Routing quectel {{.DongleID}} to extension {{.Extension.Username}})
exten => s,n,Dial(PJSIP/{{.Extension.Username}},30)
exten => s,n,Hangup()
{{end}}
{{end}}

; Quectel 设备上下文：处理来电、短信、USSD（别名，用于兼容）
[quectel-incoming]
; 处理收到的短信
; 注意：Quectel 模块会通过 AMI 事件发送短信，这里记录到日志
exten => sms,1,Verbose(Incoming SMS from ${CALLERID(num)} on ${QUECTELNAME}: ${BASE64_DECODE(${SMS_BASE64})})
exten => sms,n,System(echo '${STRFTIME(${EPOCH},,%Y-%m-%d %H:%M:%S)} - ${QUECTELNAME} - ${CALLERID(num)}: ${BASE64_DECODE(${SMS_BASE64})}' >> /var/log/asterisk/sms.txt)
; 通过 AMI UserEvent 通知 Go 程序处理短信
; 使用 BASE64 编码避免特殊字符破坏 AMI 协议
exten => sms,n,UserEvent(SMSReceived,Device: ${QUECTELNAME},Sender: ${CALLERID(num)},MessageBase64: ${SMS_BASE64})
exten => sms,n,Hangup()

; 处理收到的 USSD
exten => ussd,1,Verbose(Incoming USSD on ${QUECTELNAME}: ${BASE64_DECODE(${USSD_BASE64})})
exten => ussd,n,System(echo '${STRFTIME(${EPOCH},,%Y-%m-%d %H:%M:%S)} - ${QUECTELNAME}: ${BASE64_DECODE(${USSD_BASE64})}' >> /var/log/asterisk/ussd.txt)
exten => ussd,n,Hangup()

; 处理来电：根据 QUECTELNAME 路由到绑定的 extension
exten => s,1,NoOp(Incoming call from quectel ${QUECTELNAME})
exten => s,n,GotoIf($["${QUECTELNAME}" = ""]?no-binding)
{{range .DongleBindings}}
{{if .Inbound}}
exten => s,n,GotoIf($["${QUECTELNAME}" = "{{.DongleID}}"]?binding-{{.DongleID}})
{{end}}
{{end}}
exten => s,n(no-binding),NoOp(No extension binding found for quectel ${QUECTELNAME})
exten => s,n,Hangup()
{{range .DongleBindings}}
{{if .Inbound}}
exten => s,n(binding-{{.DongleID}}),NoOp(Routing quectel {{.DongleID}} to extension {{.Extension.Username}})
exten => s,n,Dial(PJSIP/{{.Extension.Username}},30)
exten => s,n,Hangup()
{{end}}
{{end}}

; 去电路由：从 extension 到 quectel
{{range .DongleBindings}}
{{if .Outbound}}
; Extension {{.Extension.Username}} 通过 Quectel {{.DongleID}} 去电
exten => {{.Extension.Username}},1,NoOp(Outgoing call from extension {{.Extension.Username}} via quectel {{.DongleID}} to ${EXTEN:{{len .Extension.Username}}})
exten => {{.Extension.Username}},n,Dial(Quectel/{{.DongleID}}/${EXTEN:{{len .Extension.Username}}})
exten => {{.Extension.Username}},n,Hangup()
{{end}}
{{end}}

; Quectel 短信发送上下文（用于通过 AMI Originate 发送短信）
[quectel-sms]
exten => _X.,1,NoOp(Sending SMS via quectel: device=${QUECTEL_DEVICE}, number=${EXTEN}, message=${SMS_MESSAGE})
exten => _X.,n,NoOp(All variables: QUECTEL_DEVICE=${QUECTEL_DEVICE}, SMS_MESSAGE=${SMS_MESSAGE}, __QUECTEL_DEVICE=${__QUECTEL_DEVICE}, __SMS_MESSAGE=${__SMS_MESSAGE})
exten => _X.,n,QuectelSendSMS(${QUECTEL_DEVICE},${EXTEN},${SMS_MESSAGE},1440,yes,"")
exten => _X.,n,Hangup()
