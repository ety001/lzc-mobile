[general]
; Disable legacy chan_sip compatibility
disable_tcp = no
disable_udp = no

; Transport configuration
[transport-udp]
type = transport
protocol = udp
bind = {{.SIPHost}}:{{.SIPPort}}

[transport-tcp]
type = transport
protocol = tcp
bind = {{.SIPHost}}:{{.SIPPort}}
; TCP-specific settings
tos = 0x18
cos = 5

; Template for endpoints
[endpoint-template](!)
type = endpoint
context = default
disallow = all
; 只使用 ulaw 和 alaw，避免 g729 转码问题
; 注意：Asterisk Alpine 包不包含 g729 转码模块（codec_g729.so）
; 如果客户端使用 g729，需要客户端配置为使用 ulaw 或安装转码模块
allow = ulaw
allow = alaw
allow = gsm
; allow = g729  ; 已禁用，因为缺少转码模块
direct_media = no
rtp_symmetric = yes
force_rport = yes
rewrite_contact = yes
send_pai = yes
trust_connected_line = yes
device_state_busy_at = 1

; Template for AORs
[aor-template](!)
type = aor
max_contacts = 10
remove_existing = yes
qualify_frequency = 60
qualify_timeout = 3.0

; Template for auth
[auth-template](!)
type = auth
auth_type = userpass

; Extension configurations
{{range .Extensions}}
; AOR for {{.Username}}
[{{.Username}}](aor-template)
type = aor
qualify_frequency = 60
remove_existing = yes

; Auth for {{.Username}}
[{{.Username}}](auth-template)
type = auth
username = {{.Username}}
password = {{.Secret}}

; Endpoint for {{.Username}} - 支持 TCP 和 UDP
[{{.Username}}](endpoint-template)
type = endpoint
auth = {{.Username}}
aors = {{.Username}}
{{if .CallerID}}callerid = {{.CallerID}}{{end}}
{{if .Context}}context = {{.Context}}{{end}}
; 不指定 transport，允许客户端自动选择 TCP 或 UDP
; transport 将在客户端注册时根据实际连接协议自动匹配
{{end}}
