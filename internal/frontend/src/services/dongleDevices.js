import api from './api';

export const dongleDeviceAPI = {
  list: () => api.get('/dongle-devices'),
  get: (id) => api.get(`/dongle-devices/${id}`),
  create: (data) => api.post('/dongle-devices', data),
  update: (id, data) => api.put(`/dongle-devices/${id}`, data),
  delete: (id) => api.delete(`/dongle-devices/${id}`),
};
