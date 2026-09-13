;
; RTP Configuration — must match LazyCat ingress publish_port (UDP)
; and database rtp_configs. With network_mode: host, LAN clients can
; also use these ports on the box IP.
;
[general]
rtpstart={{.RTPStartPort}}
rtpend={{.RTPEndPort}}
strictrtp=no
