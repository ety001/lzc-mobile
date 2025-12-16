[general]
enabled = yes
port = 5038
bindaddr = 0.0.0.0

; AMI 用户配置
; 用户名和密码从环境变量读取
[{{.AMIUsername}}]
secret = {{.AMIPassword}}
deny = 0.0.0.0/0.0.0.0
permit = 127.0.0.1/255.255.255.255
permit = ::1/128
read = system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan
write = system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan
