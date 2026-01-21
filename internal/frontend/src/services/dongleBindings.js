import api from './api';

export const dongleBindingAPI = {
  list: () => api.get('/dongle-bindings'),
  create: (data) => api.post('/dongle-bindings', data),
  delete: (id) => api.delete(`/dongle-bindings/${id}`),
  sendSMS: (id, data) => api.post(`/dongle-bindings/${id}/send-sms`, data),
};
