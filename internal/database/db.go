package database

import (
	"log"
	"os"
	"path/filepath"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB 全局数据库实例
var DB *gorm.DB

// Init 初始化数据库连接
func Init() error {
	// 数据库文件路径（在容器中通常为 /var/lib/lzc-mobile/data.db）
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data.db"
	}

	// 确保目录存在
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	// 连接数据库
	var err error
	DB, err = gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return err
	}

	// 自动迁移
	if err := AutoMigrate(DB); err != nil {
		return err
	}

	log.Printf("Database initialized at %s", dbPath)
	return nil
}

// Seed 填充种子数据（默认配置）
func Seed() error {
	// 检查是否已有数据
	var sipCount int64
	DB.Model(&SIPConfig{}).Count(&sipCount)
	if sipCount > 0 {
		log.Println("Database already seeded, skipping...")
		return nil
	}

	// 创建默认 SIP 配置
	sipConfig := SIPConfig{
		Port: 5060,
		Host: "0.0.0.0",
	}
	if err := DB.Create(&sipConfig).Error; err != nil {
		return err
	}

	// 创建默认 RTP 配置
	rtpConfig := RTPConfig{
		StartPort: 40890,
		EndPort:   40900,
	}
	if err := DB.Create(&rtpConfig).Error; err != nil {
		return err
	}

	log.Println("Database seeded with default configuration")
	return nil
}
