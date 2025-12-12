[general]
interval=30
autodelete=yes
u2diag=-1
disable=no

; Dongle 设备配置
; 注意：实际的 dongle 设备配置需要通过 AMI 或手动添加
; 这里只提供模板结构

{{range .Dongles}}
[{{.ID}}]
{{if .IMEI}}imei={{.IMEI}}{{end}}
{{if .IMSI}}imsi={{.IMSI}}{{end}}
{{if .Device}}device={{.Device}}{{end}}
{{if .Group}}group={{.Group}}{{end}}
{{if .Audio}}audio={{.Audio}}{{end}}
{{if .Data}}data={{.Data}}{{end}}
{{if .Disable}}disable={{.Disable}}{{end}}

{{end}}
