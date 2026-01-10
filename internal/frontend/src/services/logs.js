import api from './api';

// 获取 API 基础地址（与 api.js 保持一致）
const getApiBaseURL = () => {
  const baseURL = import.meta.env.VITE_API_BASE_URL;
  return baseURL ? `${baseURL}/api/v1` : '/api/v1';
};

export const logsAPI = {
  get: (lines = 100) => api.get(`/logs?lines=${lines}`),
  stream: () => new EventSource(`${getApiBaseURL()}/logs/stream`, { withCredentials: true }),
};
