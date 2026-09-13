import api from "./api";

export const softphoneAPI = {
  status: () => api.get("/softphone/status"),
};
