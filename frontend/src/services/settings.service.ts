import { api } from "./api";

export const settingsService = {
  /** Fires a real test email to the signed-in user via the configured provider. */
  testEmail: () => api.post("/settings/test-email"),
};
