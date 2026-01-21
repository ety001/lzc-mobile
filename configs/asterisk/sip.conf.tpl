[general]
; SIP 通用配置（保留兼容性，建议使用 PJSIP）
context=default
allowguest=no
allowoverlap=no
; 同时启用 UDP 和 TCP
udpbindaddr={{.SIPHost}}:{{.SIPPort}}
tcpbindaddr={{.SIPHost}}:{{.SIPPort}}
tcpenable=yes
udpenable=yes
transport=udp
srvlookup=no
qualify=yes
nat=force_rport,comedia
directmedia=no
disallow=all
allow=ulaw
allow=alaw
allow=gsm
allow=g729

; RTP 端口范围
rtpstart={{.RTPStartPort}}
rtpend={{.RTPEndPort}}

; Extension 配置
{{range .Extensions}}
[{{.Username}}]
type=friend
username={{.Username}}
secret={{.Secret}}
{{if .CallerID}}callerid={{.CallerID}}{{end}}
host={{.Host}}
context={{.Context}}
qualify=yes
nat=force_rport,comedia
directmedia=no
disallow=all
allow=ulaw
allow=alaw
allow=gsm
allow=g729

{{end}}
