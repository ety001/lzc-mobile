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
exten => {{.Username}},n,Dial(SIP/{{.Username}},30)
exten => {{.Username}},n,Hangup()
{{end}}

; 通用路由：尝试呼叫任何已注册的 SIP peer（用于未明确配置的 extension）
; 匹配单数字（0-9）
exten => X,1,NoOp(Attempting to call SIP peer: ${EXTEN})
exten => X,n,Dial(SIP/${EXTEN},30,tT)
exten => X,n,GotoIf($["${DIALSTATUS}" = "CHANUNAVAIL"]?error:hangup)
exten => X,n(hangup),Hangup()
exten => X,n(error),NoOp(Call failed: ${DIALSTATUS} - SIP peer ${EXTEN} not found or not registered)
exten => X,n,Hangup()
; 匹配任意数字（至少2位），尝试通过 SIP 呼叫
exten => _X.,1,NoOp(Attempting to call SIP peer: ${EXTEN})
exten => _X.,n,Dial(SIP/${EXTEN},30,tT)
exten => _X.,n,GotoIf($["${DIALSTATUS}" = "CHANUNAVAIL"]?error:hangup)
exten => _X.,n(hangup),Hangup()
exten => _X.,n(error),NoOp(Call failed: ${DIALSTATUS} - SIP peer ${EXTEN} not found or not registered)
exten => _X.,n,Hangup()

{{range .DongleBindings}}
; Dongle {{.DongleID}} 绑定到 Extension {{.Extension.Username}}
{{if .Inbound}}
; 来电路由：从 dongle 到 extension
exten => _X.,1,NoOp(Incoming call from dongle {{.DongleID}} to extension {{.Extension.Username}})
exten => _X.,n,Dial(SIP/{{.Extension.Username}},30)
exten => _X.,n,Hangup()
{{end}}

{{if .Outbound}}
; 去电路由：从 extension 到 dongle
exten => {{.Extension.Username}},1,NoOp(Outgoing call from extension {{.Extension.Username}} to dongle {{.DongleID}})
exten => {{.Extension.Username}},n,Dial(Dongle/{{.DongleID}}/${EXTEN:{{len .Extension.Username}}})
exten => {{.Extension.Username}},n,Hangup()
{{end}}
{{end}}
