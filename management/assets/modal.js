import { setVisible } from "./elements.js";

const modal = document.querySelector("#global_modal");
const dialog = modal.querySelector(".modal-dialog");
const body = modal.querySelector(".modal-body");
const title = modal.querySelector(".modal-title");
const cancelButton = modal.querySelector(".btn-default");
const confirmButton = modal.querySelector(".btn-danger");
let callbacks = [];
let choice = null;
let priorFocus = null;

function contentNode(content) {
  if (typeof content === "string") {
    const paragraph = document.createElement("p");
    paragraph.textContent = content;
    return paragraph;
  }
  if (content instanceof Node) return content;
  throw new TypeError("Modal content must be a string or DOM node.");
}

export { showModalConfirm as show_modal_confirm, showModalError as show_modal_error };

export function hideModal(selected = 1) {
  if (!modal.classList.contains("in")) return;
  choice = selected;
  modal.classList.remove("in");
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
  document.querySelector(".modal-backdrop")?.remove();
  document.body.classList.remove("modal-open");
  priorFocus?.focus();
  callbacks[choice]?.();
  callbacks = [];
}

function showModal() {
  priorFocus = document.activeElement;
  choice = null;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop fade in";
  backdrop.addEventListener("click", () => hideModal());
  document.body.append(backdrop);
  document.body.classList.add("modal-open");
  modal.style.display = "block";
  modal.removeAttribute("aria-hidden");
  modal.classList.add("in");
  (body.querySelector("input, select, textarea, button") || cancelButton).focus();
}

export function showModalError(heading, message, callback) {
  title.textContent = heading;
  body.replaceChildren(contentNode(message));
  dialog.classList.toggle("modal-sm", typeof message === "string");
  cancelButton.textContent = "OK";
  setVisible(cancelButton, true);
  setVisible(confirmButton, false);
  callbacks = [callback, callback];
  showModal();
  return false;
}

export function showModalConfirm(heading, question, verbs, yesCallback, cancelCallback) {
  title.textContent = heading;
  body.replaceChildren(contentNode(question));
  dialog.classList.toggle("modal-sm", typeof question === "string");
  const labels = typeof verbs === "string" ? [verbs, "Cancel"] : verbs;
  confirmButton.textContent = labels[0];
  cancelButton.textContent = labels[1];
  setVisible(cancelButton, true);
  setVisible(confirmButton, true);
  callbacks = [yesCallback, cancelCallback];
  showModal();
  return false;
}

export function initializeModal() {
  modal.setAttribute("aria-hidden", "true");
  modal.querySelector(".close").addEventListener("click", () => hideModal());
  cancelButton.addEventListener("click", () => hideModal(1));
  confirmButton.addEventListener("click", () => hideModal(0));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("in")) hideModal();
  });
}
