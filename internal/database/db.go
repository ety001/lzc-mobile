package database

import (
	"log"
	"os"
	"path/filepath"
	"strings"

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

	// 迁移：删除 dongle_bindings 表的旧唯一索引（如果存在）
	if err := migrateDongleBindings(DB); err != nil {
		log.Printf("Warning: Failed to migrate dongle_bindings: %v", err)
		// 不返回错误，因为可能索引已经不存在
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

// migrateDongleBindings 迁移 dongle_bindings 表，删除旧的唯一索引
func migrateDongleBindings(db *gorm.DB) error {
	// SQLite 中，唯一索引可能以以下方式存在：
	// 1. 作为 UNIQUE 约束在表定义中
	// 2. 作为 CREATE UNIQUE INDEX 创建的索引

	// 直接删除已知的唯一索引名称（更可靠）
	knownIndexNames := []string{
		"idx_dongle_bindings_dongle_id",
		"dongle_bindings_dongle_id_idx",
		"uq_dongle_bindings_dongle_id",
	}
	for _, idxName := range knownIndexNames {
		if err := db.Exec("DROP INDEX IF EXISTS " + idxName).Error; err != nil {
			log.Printf("Warning: Failed to drop index %s: %v", idxName, err)
		} else {
			log.Printf("Dropped index: %s", idxName)
		}
	}

	// 查询所有索引，查找其他可能包含 dongle_id 的唯一索引
	rows, err := db.Raw("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='dongle_bindings'").Rows()
	if err != nil {
		// 表可能不存在，这是正常的
		return nil
	}
	defer rows.Close()

	for rows.Next() {
		var idx struct {
			Name string
			SQL  *string
		}
		if err := rows.Scan(&idx.Name, &idx.SQL); err != nil {
			continue
		}
		// 跳过已知的普通索引
		if idx.Name == "idx_dongle_bindings_extension_id" {
			continue
		}
		if idx.SQL != nil && strings.Contains(strings.ToUpper(*idx.SQL), "UNIQUE") && strings.Contains(*idx.SQL, "dongle_id") {
			// 找到包含 dongle_id 的唯一索引，删除它
			log.Printf("Removing unique index on dongle_bindings.dongle_id: %s", idx.Name)
			if err := db.Exec("DROP INDEX IF EXISTS " + idx.Name).Error; err != nil {
				log.Printf("Warning: Failed to drop index %s: %v", idx.Name, err)
			} else {
				log.Printf("Dropped unique index: %s", idx.Name)
			}
		}
	}

	// 对于 SQLite，如果唯一约束是在表定义中的，需要重建表
	// 但为了安全，我们先检查是否有数据，如果有数据且存在唯一约束冲突，再考虑重建
	var count int64
	if err := db.Table("dongle_bindings").Count(&count).Error; err != nil {
		// 表可能不存在，这是正常的
		return nil
	}

	// 检查是否有重复的 dongle_id（如果有唯一约束，这不应该存在）
	var duplicates []struct {
		DongleID string
		Count    int64
	}
	if err := db.Table("dongle_bindings").
		Select("dongle_id, COUNT(*) as count").
		Group("dongle_id").
		Having("COUNT(*) > 1").
		Scan(&duplicates).Error; err == nil && len(duplicates) > 0 {
		log.Printf("Found %d dongle_id values with multiple bindings, unique constraint should be removed", len(duplicates))
	}

	return nil
}
