package main

import (
	"log"
	"os"

	"github.com/ety001/lzc-mobile/internal/ami"
	"github.com/ety001/lzc-mobile/internal/auth"
	"github.com/ety001/lzc-mobile/internal/config"
	"github.com/ety001/lzc-mobile/internal/database"
	"github.com/ety001/lzc-mobile/internal/sms"
	"github.com/ety001/lzc-mobile/internal/web"
	"github.com/gin-gonic/gin"
)

func main() {
	// 从环境变量读取配置
	webPort := os.Getenv("WEB_PORT")
	if webPort == "" {
		webPort = "8071"
	}

	// 检查 OIDC 配置（启动时强制要求）
	if _, err := auth.GetOIDCConfig(); err != nil {
		log.Fatalf("OIDC configuration error: %v", err)
	}

	// 初始化数据库
	if err := database.Init(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// 填充种子数据
	if err := database.Seed(); err != nil {
		log.Fatalf("Failed to seed database: %v", err)
	}

	// 初始化配置渲染器
	templateDir := os.Getenv("ASTERISK_TEMPLATE_DIR")
	if templateDir == "" {
		templateDir = "./configs/asterisk"
	}
	outputDir := os.Getenv("ASTERISK_CONFIG_DIR")
	if outputDir == "" {
		outputDir = "/etc/asterisk"
	}
	// 确保输出目录存在
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		log.Fatalf("Failed to create asterisk config directory: %v", err)
	}

	renderer := config.NewRenderer(templateDir, outputDir)

	// 首次渲染配置文件
	if err := renderer.RenderAll(); err != nil {
		log.Printf("Warning: Failed to render initial config files: %v", err)
	} else {
		log.Println("Asterisk configuration files rendered successfully")
	}

	// 初始化 AMI 管理器
	amiManager := ami.GetManager()
	if err := amiManager.Init(); err != nil {
		log.Printf("Warning: Failed to initialize AMI client: %v", err)
		log.Println("AMI features will be unavailable")
	} else {
		log.Println("AMI client initialized successfully")
		// 确保程序退出时关闭 AMI 连接
		defer func() {
			if err := amiManager.Close(); err != nil {
				log.Printf("Error closing AMI connection: %v", err)
			}
		}()

		// 初始化短信处理器并注册到 AMI 管理器
		smsHandler := sms.NewHandler()
		smsHandler.Register()
		log.Println("SMS handler initialized and registered")
	}

	// 初始化 Gin 路由
	r := gin.Default()

	// 设置 API 路由
	router := web.NewRouter(renderer)
	router.SetupRoutes(r)

	// TODO: 添加静态文件服务和前端路由

	// 启动服务器
	log.Printf("Starting web panel on port %s", webPort)
	if err := r.Run(":" + webPort); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
