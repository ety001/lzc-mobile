[general]
interval=30
autodelete=yes
u2diag=-1
disable=no

; Quectel 设备配置（从数据库动态生成）
{{range .Dongles}}
[{{.DeviceID}}]
device={{.Device}}
audio={{.Audio}}
data={{.Data}}
group={{.Group}}
context={{.Context}}
disable={{if .Disable}}yes{{else}}no{{end}}
{{end}}
