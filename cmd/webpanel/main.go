package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/lazycat-cloud/lzc-mobile/internal/config"
	"github.com/lazycat-cloud/lzc-mobile/internal/database"
)

func main() {
	// 从环境变量读取配置
	webPort := os.Getenv("WEB_PORT")
	if webPort == "" {
		webPort = "8071"
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

	// 初始化 Gin 路由
	r := gin.Default()

	// TODO: 添加路由和中间件

	// 启动服务器
	log.Printf("Starting web panel on port %s", webPort)
	if err := r.Run(":" + webPort); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
