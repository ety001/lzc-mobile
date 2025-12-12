package web

import (
	"github.com/ety001/lzc-mobile/internal/auth"
	"github.com/ety001/lzc-mobile/internal/config"
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
		}

		// 系统状态
		system := api.Group("/system")
		{
			system.GET("/status", r.getSystemStatus)
			system.POST("/reload", r.reloadAsterisk)
			system.POST("/restart", r.restartAsterisk)
		}

		// 日志接口
		logs := api.Group("/logs")
		{
			logs.GET("", r.getLogs)
			logs.GET("/stream", r.streamLogs)
		}
	}

	// 静态文件服务（前端构建产物）
	engine.Static("/static", "./web/dist/assets")
	engine.StaticFile("/favicon.ico", "./web/dist/favicon.ico")

	// SPA 路由：所有非 API 和非静态文件的请求都返回 index.html
	engine.NoRoute(func(c *gin.Context) {
		// 如果是 API 请求，返回 404
		if c.Request.URL.Path[:4] == "/api" {
			c.JSON(404, gin.H{"error": "Not found"})
			return
		}
		// 否则返回前端页面
		c.File("./web/dist/index.html")
	})
}
