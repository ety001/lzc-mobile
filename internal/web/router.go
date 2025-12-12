package web

import (
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
	api := engine.Group("/api/v1")
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
	}
}
