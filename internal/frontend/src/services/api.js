import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true, // 发送 cookie
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // 未授权，重定向到登录页
      window.location.href = '/auth/login';
    }
    return Promise.reject(error);
  }
);

export default api;
