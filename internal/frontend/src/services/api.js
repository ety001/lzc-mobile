import axios from 'axios';

// 从环境变量获取 API 基础地址，开发环境可以使用远程服务器
// 如果 VITE_API_BASE_URL 为空，则使用相对路径（生产环境）
const apiBaseURL = import.meta.env.VITE_API_BASE_URL 
  ? `${import.meta.env.VITE_API_BASE_URL}/api/v1`
  : '/api/v1';

const api = axios.create({
  baseURL: apiBaseURL,
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/auth/login';
    }
    return Promise.reject(error);
  }
);

export default api;
