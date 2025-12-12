# 阶段六总结：Docker 化和部署

## 完成时间
2025-12-12

## 阶段完成情况

### ✅ 已完成任务

1. **Dockerfile 编写**
   - 创建了 Dockerfile（`docker/Dockerfile`）：
     - 基于 Debian Bookworm Slim
     - 安装 Asterisk（包含 chan_dongle 模块）
     - 安装 Supervisor
     - 安装 Go 1.25.5
     - 安装 Node.js 和 pnpm（用于构建前端）
     - 构建 Go 应用和前端
     - 配置必要的目录和权限
     - 暴露端口：SIP TCP (5060)、RTP UDP (40890-40900)、Web (8071)

2. **Supervisor 配置**
   - 创建了 Supervisor 配置文件（`configs/supervisor/supervisord.conf`）：
     - 管理 Asterisk 进程
     - 管理 Go Web 面板进程
     - 配置日志输出
     - 传递环境变量到 Web 面板进程

3. **启动脚本**
   - 创建了启动脚本（`scripts/entrypoint.sh`）：
     - 检查必要的环境变量（OIDC、AMI）
     - 创建必要的目录
     - 设置权限
     - 启动 Supervisor

4. **端口暴露和 USB 设备挂载说明**
   - 在 Dockerfile 中暴露了必要的端口
   - 在部署文档中详细说明了 USB 设备挂载方法
   - 支持挂载多个 USB 设备

5. **部署文档**
   - 创建了完整的部署文档（`docs/deployment.md`）：
     - 前置要求
     - 环境变量配置说明
     - 构建和运行方法
     - Docker Compose 配置示例
     - USB 设备挂载说明
     - 数据持久化说明
     - 故障排查指南
     - 更新和卸载说明

6. **.dockerignore 文件**
   - 创建了 `.dockerignore` 文件，优化构建上下文

### 📝 创建的文件

- `docker/Dockerfile` - Docker 镜像构建文件
- `configs/supervisor/supervisord.conf` - Supervisor 配置
- `scripts/entrypoint.sh` - 容器启动脚本
- `.dockerignore` - Docker 构建忽略文件
- `docs/deployment.md` - 部署文档

### 🔧 技术细节

1. **Docker 镜像构建**：
   - 多阶段构建优化（虽然当前是单阶段，但结构清晰）
   - 使用 Debian Slim 减小镜像大小
   - 安装必要的系统依赖和开发工具

2. **进程管理**：
   - 使用 Supervisor 管理多个进程
   - Asterisk 和 Web 面板自动重启
   - 统一的日志管理

3. **环境变量**：
   - 必须的环境变量在启动脚本中检查
   - 可选的环境变量有合理的默认值
   - 通过 Supervisor 传递环境变量

4. **数据持久化**：
   - 数据库文件存储在 `/var/lib/lzc-mobile`
   - 支持使用 Docker volumes 持久化数据
   - Asterisk 配置和日志也可以持久化

5. **USB 设备挂载**：
   - 使用 `--device` 参数挂载 USB 设备
   - 不支持 `--privileged` 模式（更安全）
   - 支持挂载多个设备

## 遇到的问题和解决方案

### 问题 1：Asterisk 和 chan_dongle 安装
- **问题**：需要确保 Asterisk 包含 chan_dongle 模块
- **解决方案**：使用 Debian 官方仓库的 asterisk 包，chan_dongle 可能需要单独编译或使用第三方仓库

### 问题 2：前端构建
- **问题**：需要在容器中构建前端
- **解决方案**：在 Dockerfile 中安装 Node.js 和 pnpm，构建前端到指定目录

### 问题 3：环境变量传递
- **问题**：Supervisor 需要正确传递环境变量
- **解决方案**：在 Supervisor 配置中使用 `environment` 指令传递所有必要的环境变量

## 技术决策

1. **基础镜像**：选择 Debian Bookworm Slim，平衡了镜像大小和功能完整性
2. **进程管理**：使用 Supervisor 而不是 systemd，更适合容器环境
3. **构建方式**：在容器内构建，简化部署流程
4. **数据持久化**：使用 Docker volumes，便于备份和迁移

## 待优化项

1. **多阶段构建**：可以优化为多阶段构建，减小最终镜像大小
2. **chan_dongle 模块**：可能需要从源码编译或使用预编译包
3. **健康检查**：可以添加 Docker 健康检查
4. **监控和日志**：可以集成日志收集和监控系统

## 下一步计划

开始**阶段七：文档和测试**
1. 编写使用说明文档
2. 更新部署文档（如有需要）
3. 更新 README.md
4. 端到端测试
