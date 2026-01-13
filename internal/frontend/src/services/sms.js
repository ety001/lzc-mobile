import api from "./api";

export const smsAPI = {
  list: (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append("page", params.page);
    if (params.page_size) queryParams.append("page_size", params.page_size);
    if (params.dongle_id) queryParams.append("dongle_id", params.dongle_id);
    if (params.direction) queryParams.append("direction", params.direction);
    const queryString = queryParams.toString();
    return api.get(`/sms${queryString ? `?${queryString}` : ''}`);
  },
  send: (data) => api.post("/sms/send", data),
  delete: (id) => api.delete(`/sms/${id}`),
  deleteBatch: (ids) => api.delete("/sms", { data: { ids } }),
};
