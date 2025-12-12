package config

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"text/template"

	"github.com/ety001/lzc-mobile/internal/database"
)

// ConfigData 配置模板数据
type ConfigData struct {
	SIPHost        string
	SIPPort        int
	RTPStartPort   int
	RTPEndPort     int
	Extensions     []ExtensionData
	DongleBindings []DongleBindingData
	Dongles        []DongleData
}

// ExtensionData Extension 模板数据
type ExtensionData struct {
	Username  string
	Secret    string
	CallerID  string
	Host      string
	Context   string
	Port      int
	Transport string
}

// DongleBindingData Dongle 绑定模板数据
type DongleBindingData struct {
	DongleID  string
	Extension ExtensionData
	Inbound   bool
	Outbound  bool
}

// DongleData Dongle 设备模板数据
type DongleData struct {
	ID      string
	IMEI    string
	IMSI    string
	Device  string
	Group   int
	Audio   string
	Data    string
	Disable bool
}

// Renderer 配置渲染器
type Renderer struct {
	templateDir string
	outputDir   string
}

// NewRenderer 创建新的配置渲染器
func NewRenderer(templateDir, outputDir string) *Renderer {
	return &Renderer{
		templateDir: templateDir,
		outputDir:   outputDir,
	}
}

// LoadConfigData 从数据库加载配置数据
func (r *Renderer) LoadConfigData() (*ConfigData, error) {
	data := &ConfigData{}

	// 加载 SIP 配置
	var sipConfig database.SIPConfig
	if err := database.DB.First(&sipConfig).Error; err != nil {
		return nil, fmt.Errorf("failed to load SIP config: %w", err)
	}
	data.SIPHost = sipConfig.Host
	if data.SIPHost == "" {
		data.SIPHost = "0.0.0.0"
	}
	data.SIPPort = sipConfig.Port

	// 加载 RTP 配置
	var rtpConfig database.RTPConfig
	if err := database.DB.First(&rtpConfig).Error; err != nil {
		return nil, fmt.Errorf("failed to load RTP config: %w", err)
	}
	data.RTPStartPort = rtpConfig.StartPort
	data.RTPEndPort = rtpConfig.EndPort

	// 加载 Extensions
	var extensions []database.Extension
	if err := database.DB.Find(&extensions).Error; err != nil {
		return nil, fmt.Errorf("failed to load extensions: %w", err)
	}
	data.Extensions = make([]ExtensionData, len(extensions))
	for i, ext := range extensions {
		data.Extensions[i] = ExtensionData{
			Username:  ext.Username,
			Secret:    ext.Secret,
			CallerID:  ext.CallerID,
			Host:      ext.Host,
			Context:   ext.Context,
			Port:      ext.Port,
			Transport: ext.Transport,
		}
	}

	// 加载 Dongle 绑定
	var bindings []database.DongleBinding
	if err := database.DB.Preload("Extension").Find(&bindings).Error; err != nil {
		return nil, fmt.Errorf("failed to load dongle bindings: %w", err)
	}
	data.DongleBindings = make([]DongleBindingData, len(bindings))
	for i, binding := range bindings {
		data.DongleBindings[i] = DongleBindingData{
			DongleID: binding.DongleID,
			Extension: ExtensionData{
				Username:  binding.Extension.Username,
				Secret:    binding.Extension.Secret,
				CallerID:  binding.Extension.CallerID,
				Host:      binding.Extension.Host,
				Context:   binding.Extension.Context,
				Port:      binding.Extension.Port,
				Transport: binding.Extension.Transport,
			},
			Inbound:  binding.Inbound,
			Outbound: binding.Outbound,
		}
	}

	// Dongle 设备配置（目前为空，后续可通过 AMI 获取）
	data.Dongles = []DongleData{}

	return data, nil
}

// RenderTemplate 渲染模板文件
func (r *Renderer) RenderTemplate(templateName, outputName string, data interface{}) error {
	// 读取模板文件
	templatePath := filepath.Join(r.templateDir, templateName)
	tmpl, err := template.ParseFiles(templatePath)
	if err != nil {
		return fmt.Errorf("failed to parse template %s: %w", templatePath, err)
	}

	// 渲染模板
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return fmt.Errorf("failed to execute template %s: %w", templateName, err)
	}

	// 确保输出目录存在
	if err := os.MkdirAll(r.outputDir, 0755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	// 写入配置文件
	outputPath := filepath.Join(r.outputDir, outputName)
	if err := os.WriteFile(outputPath, buf.Bytes(), 0644); err != nil {
		return fmt.Errorf("failed to write config file %s: %w", outputPath, err)
	}

	return nil
}

// RenderAll 渲染所有配置文件
func (r *Renderer) RenderAll() error {
	// 加载配置数据
	data, err := r.LoadConfigData()
	if err != nil {
		return err
	}

	// 渲染 sip.conf
	if err := r.RenderTemplate("sip.conf.tpl", "sip.conf", data); err != nil {
		return fmt.Errorf("failed to render sip.conf: %w", err)
	}

	// 渲染 extensions.conf
	if err := r.RenderTemplate("extensions.conf.tpl", "extensions.conf", data); err != nil {
		return fmt.Errorf("failed to render extensions.conf: %w", err)
	}

	// 渲染 dongle.conf
	if err := r.RenderTemplate("dongle.conf.tpl", "dongle.conf", data); err != nil {
		return fmt.Errorf("failed to render dongle.conf: %w", err)
	}

	return nil
}
