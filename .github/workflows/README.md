# GitHub Actions Workflows

## Docker Build Workflow

### 功能
- 当 `master` 分支有更新时自动触发
- 构建 Docker 镜像并推送到 Docker Hub
- 镜像名称：`ety001/lzc-mobile:latest`

### 配置要求

在 GitHub 仓库的 Settings > Secrets and variables > Actions 中添加以下 secrets：

1. **DOCKERHUB_USERNAME**: Docker Hub 用户名（例如：`ety001`）
2. **DOCKERHUB_TOKEN**: Docker Hub 访问令牌（Access Token）

### 如何获取 Docker Hub Token

1. 登录 [Docker Hub](https://hub.docker.com/)
2. 进入 Account Settings > Security
3. 点击 "New Access Token"
4. 创建具有读写权限的 token
5. 将 token 添加到 GitHub Secrets 中

### 触发条件

1. **自动触发**：
   - 仅在 `master` 分支的 `push` 事件触发
   - 忽略 `.md`、`.gitignore`、`.dockerignore` 文件的变更

2. **手动触发**：
   - 在 GitHub Actions 页面点击 "Run workflow"
   - 可以选择要构建的分支（master、main、develop）
   - 支持手动构建任意分支的镜像

### 构建优化

- 使用 Docker Buildx 进行构建
- **多架构支持**：同时构建 `linux/amd64` 和 `linux/arm64` 架构
- 启用构建缓存以加速后续构建
- 自动提取元数据和标签

### 支持的架构

- **linux/amd64** (x86_64)
- **linux/arm64** (ARM64)

镜像会自动包含两个架构的版本，Docker 会根据运行环境自动选择对应的架构。
