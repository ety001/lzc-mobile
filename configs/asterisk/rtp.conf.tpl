;
; RTP Configuration — Audio A/B profiles
;   A: Alpine/default-like wide range (f55a267 era; host LAN can use full range)
;   B: LazyCat ingress publish_port alignment (40890-40920 from DB)
;
[general]
{{if eq .AudioABProfile "B"}}
rtpstart={{.RTPStartPort}}
rtpend={{.RTPEndPort}}
strictrtp=no
{{else}}
rtpstart=10000
rtpend=20000
strictrtp=yes
{{end}}
