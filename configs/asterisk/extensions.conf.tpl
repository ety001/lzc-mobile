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
exten => _X.,1,NoOp(Default context: ${EXTEN})
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
