let credentials = null;
let currentPanel = null;
let switchBackPanel = null;
const panels = new Map();

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
  localStorage.removeItem("miab-cp-credentials");
  sessionStorage.removeItem("miab-cp-credentials");
}

export { clearCredentials as clear_credentials, showPanel as show_panel };

export function restoreCredentials() {
  try {
    const saved =
      sessionStorage.getItem("miab-cp-credentials") || localStorage.getItem("miab-cp-credentials");
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
