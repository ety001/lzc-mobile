import api from './api';

export const donglesAPI = {
  list: () => api.get('/dongles'),
  create: (data) => api.post('/dongles', data),
  update: (id, data) => api.put(`/dongles/${id}`, data),
  delete: (id) => api.delete(`/dongles/${id}`),
  sendSMS: (id, data) => api.post(`/dongles/${id}/send-sms`, data),
};
