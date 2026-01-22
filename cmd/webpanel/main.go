package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"time"

	"github.com/ety001/lzc-mobile/internal/ami"
	"github.com/ety001/lzc-mobile/internal/config"
	"github.com/ety001/lzc-mobile/internal/database"
	"github.com/ety001/lzc-mobile/internal/sms"
	"github.com/ety001/lzc-mobile/internal/web"
	"github.com/gin-gonic/gin"
)

func main() {
	// 运行 web 服务器
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
		outputDir = "./etc/asterisk"
	}

	renderer := config.NewRenderer(templateDir, outputDir)

	// 首次渲染配置文件
	if err := renderer.RenderAll(); err != nil {
		log.Printf("Warning: Failed to render initial config files: %v", err)
	} else {
		log.Println("Asterisk configuration files rendered successfully")
		// 等待一下，确保配置文件写入完成
		time.Sleep(500 * time.Millisecond)
		// 尝试让 Asterisk 重新加载 manager 配置
		if err := reloadAsteriskManager(); err != nil {
			log.Printf("Warning: Failed to reload Asterisk manager config: %v", err)
			log.Println("Asterisk may need to be restarted to load the new manager configuration")
		} else {
			log.Println("Asterisk manager configuration reloaded successfully")
		}
	}

	// 初始化 AMI 管理器（延迟重试，等待 Asterisk 启动）
	amiManager := ami.GetManager()
	// 在后台异步初始化 AMI，避免阻塞主程序启动
	go func() {
		// 等待 Asterisk 启动（最多等待 30 秒）
		maxRetries := 15
		retryInterval := 2 * time.Second
		var err error
		for i := 0; i < maxRetries; i++ {
			if err = amiManager.Init(); err == nil {
				log.Println("AMI manager initialized successfully")
				// 注册 SMS handler，通过 AMI 事件接收的 SMS 也会保存到数据库
				smsHandler := sms.NewHandler()
				smsHandler.Register()
				return
			}
			if i < maxRetries-1 {
				log.Printf("Failed to initialize AMI manager (attempt %d/%d): %v, retrying in %v...", i+1, maxRetries, err, retryInterval)
				time.Sleep(retryInterval)
			}
		}
		log.Printf("Warning: Failed to initialize AMI manager after %d attempts: %v", maxRetries, err)
		log.Println("AMI features will be unavailable, but the web server will still start")
	}()

	// 设置 Gin 模式
	gin.SetMode(gin.ReleaseMode)

	// 创建 Gin 引擎
	engine := gin.Default()

	// 设置工作目录为 /app（与容器内的工作目录一致）
	// 这样 static.LocalFile 可以使用相对路径
	if err := os.Chdir("/app"); err != nil {
		log.Printf("Warning: Failed to change working directory to /app: %v", err)
	}

	// 创建路由并设置
	router := web.NewRouter(renderer)
	router.SetupRoutes(engine)

	// 获取端口
	port := os.Getenv("WEB_PORT")
	if port == "" {
		port = "8071"
	}

	// 启动服务器
	addr := fmt.Sprintf(":%s", port)
	log.Printf("Starting web server on %s", addr)
	if err := engine.Run(addr); err != nil {
		log.Fatalf("Failed to start web server: %v", err)
	}
}

// reloadAsteriskManager 重新加载 Asterisk manager 配置
func reloadAsteriskManager() error {
	// 使用 asterisk -rx 命令重新加载 manager 配置
	cmd := exec.Command("asterisk", "-rx", "manager reload")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to reload manager: %v, output: %s", err, string(output))
	}
	log.Printf("Asterisk manager reload output: %s", string(output))
	return nil
}
