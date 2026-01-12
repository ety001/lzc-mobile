import api from './api';

export const notificationsAPI = {
  list: () => api.get('/notifications'),
  update: (channel, data) => api.put(`/notifications/${channel}`, data),
  test: (channel) => api.post(`/notifications/${channel}/test`),
};
