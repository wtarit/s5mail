import { api } from "../api.js";
import { showModalError } from "../modal.js";
import { clearCredentials, showPanel } from "../state.js";

const form = document.querySelector("#account-password-form");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const currentPassword = form.querySelector("#account-current-password").value;
  const newPassword = form.querySelector("#account-new-password").value;
  const confirmPassword = form.querySelector("#account-confirm-password").value;

  if (newPassword !== confirmPassword) {
    showModalError("Password not changed", "The new passwords do not match.");
    return;
  }

  api(
    "/mail/users/me/password",
    "POST",
    {
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    },
    (response) => {
      form.reset();
      clearCredentials();
      document.dispatchEvent(new CustomEvent("s5mail:credentials-changed"));
      showPanel("login");
      showModalError("Password changed", response.message);
    },
    (message) => showModalError("Password not changed", message),
  );
});
