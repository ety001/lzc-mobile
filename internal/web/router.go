package web

import (
	"github.com/ety001/lzc-mobile/internal/auth"
	"github.com/ety001/lzc-mobile/internal/config"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// Router 路由配置
type Router struct {
	renderer *config.Renderer
}

// NewRouter 创建新的路由
func NewRouter(renderer *config.Renderer) *Router {
	return &Router{
		renderer: renderer,
	}
}

// SetupRoutes 设置所有路由
func (r *Router) SetupRoutes(engine *gin.Engine) {
	// 静态文件服务（前端构建产物）
	// 使用 gin-contrib/static 中间件，参考 turtle/router/router.go 的实现
	// static.Serve 必须在所有路由之前注册
	// 第二个参数 true 表示文件不存在时 fallback 到 index.html（SPA 模式）
	// 使用相对路径 ./dist，因为主程序已经将工作目录设置为 /app
	engine.Use(static.Serve("/", static.LocalFile("./dist", true)))

	// 认证路由（不需要认证）
	authGroup := engine.Group("/auth")
	{
		authGroup.GET("/login", auth.Login)
		authGroup.GET("/oidc/callback", auth.Callback)
		authGroup.POST("/logout", auth.Logout)
	}

	// API 路由（需要认证）
	api := engine.Group("/api/v1")
	api.Use(auth.CheckAuth)
	{
		// Extension 管理
		extensions := api.Group("/extensions")
		{
			extensions.GET("", r.listExtensions)
			extensions.GET("/:id", r.getExtension)
			extensions.POST("", r.createExtension)
			extensions.PUT("/:id", r.updateExtension)
			extensions.DELETE("/:id", r.deleteExtension)
		}

		// Dongle 管理
		dongles := api.Group("/dongles")
		{
			dongles.GET("", r.listDongleBindings)
			dongles.POST("", r.createDongleBinding)
			dongles.PUT("/:id", r.updateDongleBinding)
			dongles.DELETE("/:id", r.deleteDongleBinding)
			dongles.POST("/:id/send-sms", r.sendSMS)
		}

		// 通知配置
		notifications := api.Group("/notifications")
		{
			notifications.GET("", r.listNotificationConfigs)
			notifications.PUT("/:channel", r.updateNotificationConfig)
			notifications.POST("/:channel/test", r.testNotificationConfig)
		}

		// 系统状态
		system := api.Group("/system")
		{
			system.GET("/status", r.getSystemStatus)
			system.POST("/reload", r.reloadAsterisk)
			system.POST("/restart", r.restartAsterisk)
		}

		// 全局配置
		settings := api.Group("/settings")
		{
			settings.GET("", r.getGlobalConfig)
			settings.PUT("", r.updateGlobalConfig)
		}

		// SMS 管理
		sms := api.Group("/sms")
		{
			sms.GET("", r.listSMSMessages)
			sms.POST("/send", r.sendSMSDirect)   // 发送短信（通过 dongle_id）
			sms.DELETE("/:id", r.deleteSMSMessage)
			sms.DELETE("", r.deleteSMSMessages) // 批量删除
		}

		// WebSocket 终端
		api.GET("/terminal/ws", r.handleTerminal)
	}

	// SPA 路由 fallback：所有未匹配的路由都返回 index.html
	// 但排除 API 和认证路径
	engine.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		// 如果是 API 或认证路径，返回 404
		if (len(path) >= 5 && path[:5] == "/api/") || (len(path) >= 6 && path[:6] == "/auth/") {
			c.JSON(404, gin.H{"error": "Not found"})
			return
		}
		// 其他路径返回 index.html（SPA 路由）
		c.File("./dist/index.html")
	})
}
