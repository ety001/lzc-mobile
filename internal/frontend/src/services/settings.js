import api from "./api";

export const settingsAPI = {
  get: () => api.get("/settings"),
  update: (data) => api.put("/settings", data),
  getNotifyDevices: () => api.get("/settings/notify-devices"),
  saveNotifyDevices: (data) => api.put("/settings/notify-devices", data),
  testNotifyDevices: () => api.post("/settings/notify-devices/test"),
};
