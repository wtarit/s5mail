import { initializeModal } from "./modal.js";
import { initializeNavigation } from "./navigation.js";
import { doLogout } from "./session.js";
import { getCredentials, restoreCredentials, showPanel } from "./state.js";
import { show_hide_menus } from "./panels/login.js";
import "./panels/system-status.js";
import "./panels/users-bindings.js";
import "./panels/aliases.js";
import "./panels/custom-dns.js";
import "./panels/external-dns.js";
import "./panels/ssl.js";
import "./panels/system-backup.js";
import "./panels/mfa.js";
import "./panels/web.js";
import "./panels/munin.js";

initializeModal();
initializeNavigation();
restoreCredentials();
show_hide_menus();
document.documentElement.classList.remove("js-loading");

document.querySelector("[data-session-action='logout']").addEventListener("click", (event) => {
  event.preventDefault();
  doLogout();
});

window.addEventListener("hashchange", () => showPanel(window.location.hash.slice(1)));
if (getCredentials()) showPanel(window.location.hash.slice(1) || "welcome");
else showPanel("login");
