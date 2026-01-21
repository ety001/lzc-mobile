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
	AMIUsername    string
	AMIPassword    string
	Extensions     []ExtensionData
	DongleBindings []DongleBindingData
	Dongles        []DongleData
}

// ExtensionData Extension 模板数据
type ExtensionData struct {
	Username string
	Secret   string
	CallerID string
	Host     string
	Context  string
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
	DeviceID   string // quectel0, quectel1
	Device     string // /dev/ttyUSB0
	Audio      string // /dev/ttyUSB1
	Data       string // /dev/ttyUSB2
	Group      int    // 组号（默认 0）
	Context    string // 来电上下文
	DialPrefix string // 外呼前缀
	Disable    bool   // 是否禁用
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

	// 从环境变量加载 AMI 配置
	data.AMIUsername = os.Getenv("ASTERISK_AMI_USERNAME")
	if data.AMIUsername == "" {
		return nil, fmt.Errorf("ASTERISK_AMI_USERNAME environment variable is required")
	}
	data.AMIPassword = os.Getenv("ASTERISK_AMI_PASSWORD")
	if data.AMIPassword == "" {
		return nil, fmt.Errorf("ASTERISK_AMI_PASSWORD environment variable is required")
	}

	// 加载 Extensions
	var extensions []database.Extension
	if err := database.DB.Find(&extensions).Error; err != nil {
		return nil, fmt.Errorf("failed to load extensions: %w", err)
	}
	data.Extensions = make([]ExtensionData, len(extensions))
	for i, ext := range extensions {
		data.Extensions[i] = ExtensionData{
			Username: ext.Username,
			Secret:   ext.Secret,
			CallerID: ext.CallerID,
			Host:     ext.Host,
			Context:  ext.Context,
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
				Username: binding.Extension.Username,
				Secret:   binding.Extension.Secret,
				CallerID: binding.Extension.CallerID,
				Host:     binding.Extension.Host,
				Context:  binding.Extension.Context,
			},
			Inbound:  binding.Inbound,
			Outbound: binding.Outbound,
		}
	}

	// 加载 Dongle 设备
	var dongles []database.Dongle
	if err := database.DB.Find(&dongles).Error; err != nil {
		return nil, fmt.Errorf("failed to load dongles: %w", err)
	}
	data.Dongles = make([]DongleData, len(dongles))
	for i, dongle := range dongles {
		data.Dongles[i] = DongleData{
			DeviceID:   dongle.DeviceID,
			Device:     dongle.Device,
			Audio:      dongle.Audio,
			Data:       dongle.Data,
			Group:      dongle.Group,
			Context:    dongle.Context,
			DialPrefix: dongle.DialPrefix,
			Disable:    dongle.Disable,
		}
	}

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

	// 渲染模板（如果 data 为 nil，则使用空数据）
	if data == nil {
		data = struct{}{}
	}
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

	// 渲染 asterisk.conf（主配置文件，不需要模板数据）
	if err := r.RenderTemplate("asterisk.conf.tpl", "asterisk.conf", nil); err != nil {
		return fmt.Errorf("failed to render asterisk.conf: %w", err)
	}

	// 渲染 modules.conf（模块配置文件，不需要模板数据）
	if err := r.RenderTemplate("modules.conf.tpl", "modules.conf", nil); err != nil {
		return fmt.Errorf("failed to render modules.conf: %w", err)
	}

	// 渲染 manager.conf（AMI 配置文件，需要 AMI 用户名和密码）
	if err := r.RenderTemplate("manager.conf.tpl", "manager.conf", data); err != nil {
		return fmt.Errorf("failed to render manager.conf: %w", err)
	}

	// 渲染 logger.conf（日志轮转配置文件）
	if err := r.RenderTemplate("logger.conf.tpl", "logger.conf", nil); err != nil {
		return fmt.Errorf("failed to render logger.conf: %w", err)
	}

	// 渲染 pjsip.conf（PJSIP 配置文件，需要 SIP 配置和 Extensions）
	if err := r.RenderTemplate("pjsip.conf.tpl", "pjsip.conf", data); err != nil {
		return fmt.Errorf("failed to render pjsip.conf: %w", err)
	}

	// 渲染 sip.conf（保留兼容性，但不推荐使用）
	if err := r.RenderTemplate("sip.conf.tpl", "sip.conf", data); err != nil {
		return fmt.Errorf("failed to render sip.conf: %w", err)
	}

	// 渲染 extensions.conf
	if err := r.RenderTemplate("extensions.conf.tpl", "extensions.conf", data); err != nil {
		return fmt.Errorf("failed to render extensions.conf: %w", err)
	}

	// 渲染 quectel.conf（使用 quectel 替代 dongle）
	if err := r.RenderTemplate("quectel.conf.tpl", "quectel.conf", data); err != nil {
		return fmt.Errorf("failed to render quectel.conf: %w", err)
	}

	// 渲染 stasis.conf（Asterisk 20 需要正确的配置）
	// 使用 taskpool 配置（Asterisk 20.17.0+ 使用 taskpool 而不是 threadpool）
	// 不包含 [declined_message_types] 部分以避免文档错误
	if err := r.RenderTemplate("stasis.conf.tpl", "stasis.conf", nil); err != nil {
		return fmt.Errorf("failed to render stasis.conf: %w", err)
	}

	return nil
}
