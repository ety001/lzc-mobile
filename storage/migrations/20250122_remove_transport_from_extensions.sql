BEGIN TRANSACTION;

-- SQLite 不支持 DROP COLUMN，需要重建表
-- 1. 创建新表（不包含 transport 列）
CREATE TABLE extensions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(100) NOT NULL UNIQUE,
    secret VARCHAR(255) NOT NULL,
    callerid VARCHAR(255),
    host VARCHAR(255) DEFAULT 'dynamic',
    context VARCHAR(100) DEFAULT 'default',
    created_at DATETIME,
    updated_at DATETIME
);

-- 2. 复制数据（跳过 transport 列）
INSERT INTO extensions_new (id, username, secret, callerid, host, context, created_at, updated_at)
SELECT id, username, secret, callerid, host, context, created_at, updated_at
FROM extensions;

-- 3. 删除旧表
DROP TABLE extensions;

-- 4. 重命名新表
ALTER TABLE extensions_new RENAME TO extensions;

COMMIT;
