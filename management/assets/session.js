import { api } from "./api.js";
import { clearCredentials, showPanel } from "./state.js";

export function doLogout() {
  api("/logout", "POST");
  clearCredentials();
  showPanel("login");
  document.dispatchEvent(new CustomEvent("miab:credentials-changed"));
}
