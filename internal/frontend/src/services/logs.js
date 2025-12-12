import api from './api';

export const logsAPI = {
  get: (lines = 100) => api.get(`/logs?lines=${lines}`),
  stream: () => {
    // 使用 EventSource 进行 SSE 流式传输
    // 注意：EventSource 不支持自定义 headers，所以需要确保 API 支持 cookie 认证
    // 或者使用 token 作为查询参数
    return new EventSource('/api/v1/logs/stream', { withCredentials: true });
  },
};
