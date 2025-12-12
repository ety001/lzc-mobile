import api from './api';

export const logsAPI = {
  get: (lines = 100) => api.get(`/logs?lines=${lines}`),
  stream: () => {
    // 使用 EventSource 进行 SSE 流式传输
    return new EventSource('/api/v1/logs/stream');
  },
};
