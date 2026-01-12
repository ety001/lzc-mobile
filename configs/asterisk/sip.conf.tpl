[general]
; SIP 通用配置
context=default
allowguest=no
allowoverlap=no
udpbindaddr=0.0.0.0
tcpbindaddr={{.SIPHost}}:{{.SIPPort}}
tcpenable=yes
udpenable=no
transport=tcp
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
{{if .Port}}port={{.Port}}{{end}}
transport={{.Transport}}
qualify=yes
nat=force_rport,comedia
directmedia=no
disallow=all
allow=ulaw
allow=alaw
allow=gsm
allow=g729

{{end}}
