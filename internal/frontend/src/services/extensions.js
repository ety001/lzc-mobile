import api from './api';

export const extensionsAPI = {
  list: () => api.get('/extensions'),
  get: (id) => api.get(`/extensions/${id}`),
  create: (data) => api.post('/extensions', data),
  update: (id, data) => api.put(`/extensions/${id}`, data),
  delete: (id) => api.delete(`/extensions/${id}`),
};
