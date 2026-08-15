let credentials = null;
let currentPanel = null;
let switchBackPanel = null;
const panels = new Map();
const credentialsKey = "s5mail-cp-credentials";
const legacyCredentialsKey = "miab-cp-credentials";

export function getCredentials() {
  return credentials;
}
export function setCredentials(value) {
  credentials = value;
}
export function getCurrentPanel() {
  return currentPanel;
}
export function getSwitchBackPanel() {
  return switchBackPanel;
}
export function setSwitchBackPanel(value) {
  switchBackPanel = value;
}

export function clearCredentials() {
  credentials = null;
  localStorage.removeItem(credentialsKey);
  sessionStorage.removeItem(credentialsKey);
  localStorage.removeItem(legacyCredentialsKey);
  sessionStorage.removeItem(legacyCredentialsKey);
}

export { clearCredentials as clear_credentials, showPanel as show_panel };

export function restoreCredentials() {
  try {
    const saved =
      sessionStorage.getItem(credentialsKey) ||
      localStorage.getItem(credentialsKey) ||
      sessionStorage.getItem(legacyCredentialsKey) ||
      localStorage.getItem(legacyCredentialsKey);
    credentials = saved ? JSON.parse(saved) : null;
  } catch {
    clearCredentials();
  }
}

export function registerPanel(name, show) {
  panels.set(name, show);
}

export function showPanel(panel) {
  const name = panel instanceof Element ? panel.getAttribute("href").slice(1) : panel;
  document.querySelectorAll(".admin_panel").forEach((element) => (element.style.display = "none"));
  document.querySelector(`#panel_${name}`)?.style.setProperty("display", "block");
  panels.get(name)?.();
  currentPanel = name;
  switchBackPanel = null;
}
