[general]
interval=30
autodelete=yes
u2diag=-1
disable=no

; Quectel 设备配置
[quectel0]
device=/dev/ttyUSB0
audio=/dev/ttyUSB1
data=/dev/ttyUSB2
group=0
context=quectel-incoming
disable=no

{{range .Dongles}}
[{{.ID}}]
{{if .IMEI}}imei={{.IMEI}}{{end}}
{{if .IMSI}}imsi={{.IMSI}}{{end}}
{{if .Device}}device={{.Device}}{{end}}
{{if .Group}}group={{.Group}}{{end}}
{{if .Audio}}audio={{.Audio}}{{end}}
{{if .Data}}data={{.Data}}{{end}}
{{if .Context}}context={{.Context}}{{end}}
{{if .Disable}}disable={{.Disable}}{{end}}

{{end}}
