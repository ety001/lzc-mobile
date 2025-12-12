import api from './api';

export const systemAPI = {
  getStatus: () => api.get('/system/status'),
  reload: () => api.post('/system/reload'),
  restart: () => api.post('/system/restart'),
};
