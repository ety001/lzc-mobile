package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"
)

// OIDCConfig OIDC 配置
type OIDCConfig struct {
	ClientID     string
	ClientSecret string
	AuthURI      string
	TokenURI     string
	UserInfoURI  string
	RedirectURI  string
	oauth2.Config
}

// GetOIDCConfig 从环境变量获取 OIDC 配置
func GetOIDCConfig() (*OIDCConfig, error) {
	clientID := os.Getenv("LAZYCAT_AUTH_OIDC_CLIENT_ID")
	if clientID == "" {
		return nil, fmt.Errorf("LAZYCAT_AUTH_OIDC_CLIENT_ID environment variable is required")
	}

	clientSecret := os.Getenv("LAZYCAT_AUTH_OIDC_CLIENT_SECRET")
	if clientSecret == "" {
		return nil, fmt.Errorf("LAZYCAT_AUTH_OIDC_CLIENT_SECRET environment variable is required")
	}

	authURI := os.Getenv("LAZYCAT_AUTH_OIDC_AUTH_URI")
	if authURI == "" {
		return nil, fmt.Errorf("LAZYCAT_AUTH_OIDC_AUTH_URI environment variable is required")
	}

	tokenURI := os.Getenv("LAZYCAT_AUTH_OIDC_TOKEN_URI")
	if tokenURI == "" {
		return nil, fmt.Errorf("LAZYCAT_AUTH_OIDC_TOKEN_URI environment variable is required")
	}

	userInfoURI := os.Getenv("LAZYCAT_AUTH_OIDC_USERINFO_URI")
	if userInfoURI == "" {
		return nil, fmt.Errorf("LAZYCAT_AUTH_OIDC_USERINFO_URI environment variable is required")
	}

	// 从环境变量获取重定向 URI，默认为 /auth/oidc/callback
	redirectURI := os.Getenv("LAZYCAT_AUTH_OIDC_REDIRECT_URI")
	if redirectURI == "" {
		redirectURI = "/auth/oidc/callback"
	}

	// 从环境变量获取基础 URL，用于构建完整的重定向 URI
	// LAZYCAT_AUTH_BASE_URL: 应用程序的基础 URL（协议 + 域名/IP + 端口）
	// 用于构建 OIDC 回调的完整重定向 URI，格式：{baseURL}{redirectURI}
	// 例如：如果 baseURL 为 "https://example.com:8071"，redirectURI 为 "/auth/oidc/callback"
	// 则完整重定向 URI 为 "https://example.com:8071/auth/oidc/callback"
	// 如果未设置，尝试从请求头获取（X-Forwarded-Host 或 Host）
	baseURL := os.Getenv("LAZYCAT_AUTH_BASE_URL")
	if baseURL == "" {
		// 尝试从请求中获取（如果可用）
		// 注意：这需要在请求上下文中，但这里是在配置阶段，所以无法获取
		// 因此保持默认值，但建议在生产环境中设置环境变量
		baseURL = "http://localhost:8071"
		log.Printf("Warning: LAZYCAT_AUTH_BASE_URL not set, using default: %s. Please set it to the actual accessible URL.", baseURL)
	}

	fullRedirectURI := baseURL + redirectURI

	config := &OIDCConfig{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		AuthURI:      authURI,
		TokenURI:     tokenURI,
		UserInfoURI:  userInfoURI,
		RedirectURI:  fullRedirectURI,
		Config: oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			Endpoint: oauth2.Endpoint{
				AuthURL:  authURI,
				TokenURL: tokenURI,
			},
			RedirectURL: fullRedirectURI,
			Scopes:      []string{"openid", "profile", "email"},
		},
	}

	return config, nil
}

// generateState 生成随机 state
func generateState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// Login 处理登录请求，重定向到 OIDC 提供商
func Login(c *gin.Context) {
	// 如果 LAZYCAT_AUTH_BASE_URL 未设置，尝试从请求头获取
	baseURL := os.Getenv("LAZYCAT_AUTH_BASE_URL")
	if baseURL == "" {
		// 从请求头获取协议和主机
		scheme := "http"
		if c.GetHeader("X-Forwarded-Proto") == "https" || c.Request.TLS != nil {
			scheme = "https"
		}
		host := c.GetHeader("X-Forwarded-Host")
		if host == "" {
			host = c.Request.Host
		}
		if host != "" {
			baseURL = fmt.Sprintf("%s://%s", scheme, host)
			// 临时设置环境变量（仅对当前请求有效）
			os.Setenv("LAZYCAT_AUTH_BASE_URL", baseURL)
			log.Printf("Auto-detected LAZYCAT_AUTH_BASE_URL from request: %s", baseURL)
		}
	}

	config, err := GetOIDCConfig()
	if err != nil {
		log.Printf("OIDC config error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "OIDC configuration error"})
		return
	}

	state, err := generateState()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate state"})
		return
	}

	// 将 state 存储在 session cookie 中
	c.SetCookie("oidc_state", state, 600, "/", "", false, true)

	// 重定向到 OIDC 提供商
	url := config.AuthCodeURL(state)
	c.Redirect(http.StatusFound, url)
}

// Callback 处理 OIDC 回调
func Callback(c *gin.Context) {
	config, err := GetOIDCConfig()
	if err != nil {
		log.Printf("OIDC config error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "OIDC configuration error"})
		return
	}

	// 验证 state
	state := c.Query("state")
	cookieState, err := c.Cookie("oidc_state")
	if err != nil || state != cookieState {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid state"})
		return
	}

	// 清除 state cookie
	c.SetCookie("oidc_state", "", -1, "/", "", false, true)

	// 获取授权码
	code := c.Query("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Authorization code not provided"})
		return
	}

	// 交换 token
	ctx := context.Background()
	token, err := config.Exchange(ctx, code)
	if err != nil {
		log.Printf("Token exchange error: %v", err)
		c.Redirect(http.StatusFound, "/auth/login?error=token_exchange_failed")
		return
	}

	// 获取用户信息
	client := config.Client(ctx, token)
	resp, err := client.Get(config.UserInfoURI)
	if err != nil {
		log.Printf("UserInfo request error: %v", err)
		c.Redirect(http.StatusFound, "/auth/login?error=userinfo_failed")
		return
	}
	defer resp.Body.Close()

	// 创建会话（简化实现，实际应该存储用户信息）
	sessionToken, err := generateState()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	// 设置会话 cookie（1 天过期）
	c.SetCookie("session", sessionToken, 24*3600, "/", "", false, true)

	// 重定向到前端
	c.Redirect(http.StatusFound, "/")
}

// Logout 处理登出请求
func Logout(c *gin.Context) {
	// 清除会话 cookie
	c.SetCookie("session", "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out"})
}

// Middleware 认证中间件
func Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 检查会话 cookie
		session, err := c.Cookie("session")
		if err != nil || session == "" {
			// 未登录，重定向到登录页
			c.Redirect(http.StatusFound, "/auth/login")
			c.Abort()
			return
		}

		// TODO: 验证会话有效性（可以存储在 Redis 或数据库中）
		// 这里简化实现，只检查 cookie 是否存在

		c.Next()
	}
}

// CheckAuth 检查认证状态（用于 API）
func CheckAuth(c *gin.Context) {
	// 检查 session cookie
	session, err := c.Cookie("session")
	if err != nil || session == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		c.Abort()
		return
	}

	// TODO: 验证会话有效性（可以存储在 Redis 或数据库中）
	// 这里简化实现，只检查 cookie 是否存在

	c.Next()
}
