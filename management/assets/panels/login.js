import { api } from "../api.js";
import { query, queryAll, setVisibleAll } from "../elements.js";
import { show_modal_error } from "../modal.js";
import { doLogout } from "../session.js";
import {
  getCredentials,
  getSwitchBackPanel,
  registerPanel,
  setCredentials,
  show_panel,
} from "../state.js";

function do_login() {
  const emailInput = query("#loginEmail");
  const passwordInput = query("#loginPassword");
  const otpInput = query("#loginOtpInput");
  const loginForm = query("#loginForm");

  if (emailInput.value === "") {
    show_modal_error("Login Failed", "Enter your email address.", function () {
      emailInput.focus();
    });
    return false;
  }

  if (passwordInput.value === "") {
    show_modal_error("Login Failed", "Enter your email password.", function () {
      passwordInput.focus();
    });
    return false;
  }

  // Exchange the email address & password for an API key.
  setCredentials({ username: emailInput.value, session_key: passwordInput.value });

  api(
    "/login",
    "POST",
    {},
    function (response) {
      // This API call always succeeds. It returns a JSON object indicating
      // whether the request was authenticated or not.
      if (response.status != "ok") {
        if (
          response.status === "missing-totp-token" ||
          (response.status === "invalid" && response.reason == "invalid-totp-token")
        ) {
          loginForm.classList.add("is-twofactor");
          if (response.reason === "invalid-totp-token") {
            show_modal_error("Login Failed", "Incorrect two factor authentication token.");
          } else {
            setTimeout(() => {
              otpInput.focus();
            });
          }
        } else {
          loginForm.classList.remove("is-twofactor");

          // Show why the login failed.
          show_modal_error("Login Failed", response.reason);

          // Reset any saved credentials.
          doLogout();
        }
      } else if (!("api_key" in response)) {
        // A successful authentication must include a session key. This is
        // independent of whether the account is an administrator: regular
        // mail users need the session for self-service password changes and
        // their mail/sync instructions.
        show_modal_error("Login Failed", "The server did not return a session.");
        doLogout();
      } else {
        // Login succeeded. Admin-only panels are hidden by show_hide_menus,
        // while regular users retain access to self-service panels.

        // Save the new credentials.
        setCredentials({
          username: response.email,
          session_key: response.api_key,
          privileges: response.privileges,
        });
        var api_credentials = getCredentials();

        // Try to wipe the username/password information.
        emailInput.value = "";
        passwordInput.value = "";
        otpInput.value = "";
        loginForm.classList.remove("is-twofactor");

        // Remember the credentials.
        if (typeof localStorage != "undefined" && typeof sessionStorage != "undefined") {
          if (query("#loginRemember").checked) {
            localStorage.setItem("s5mail-cp-credentials", JSON.stringify(api_credentials));
            sessionStorage.removeItem("s5mail-cp-credentials");
          } else {
            localStorage.removeItem("s5mail-cp-credentials");
            sessionStorage.setItem("s5mail-cp-credentials", JSON.stringify(api_credentials));
          }
        }

        // Toggle menus.
        show_hide_menus();

        // Open the next panel the user wants to go to. Do this after the XHR response
        // is over so that we don't start a new XHR request while this one is finishing,
        // which confuses the loading indicator.
        setTimeout(function () {
          if (window.location.hash) {
            var panelid = window.location.hash.substring(1);
            show_panel(panelid);
          } else {
            var switch_back_to_panel = getSwitchBackPanel();
            show_panel(
              !switch_back_to_panel || switch_back_to_panel == "login"
                ? "welcome"
                : switch_back_to_panel,
            );
          }
        }, 300);
      }
    },
    undefined,
    {
      "x-auth-token": otpInput.value,
    },
  );
}

function show_login() {
  query("#loginForm").classList.remove("is-twofactor");
  query("#loginOtpInput").value = "";
  queryAll("#loginEmail, #loginPassword").find((input) => {
    if (input.value.trim()) return false;
    input.focus();
    return true;
  });
}

function show_hide_menus() {
  var api_credentials = getCredentials();
  var is_logged_in = api_credentials != null;
  var privs = api_credentials ? api_credentials.privileges : [];
  setVisibleAll(".if-logged-in", is_logged_in);
  setVisibleAll(".if-logged-in-admin, .if-logged-in-not-admin", false);
  if (is_logged_in) {
    setVisibleAll(".if-logged-in-not-admin", true);
    privs.forEach(function (priv) {
      setVisibleAll(".if-logged-in-" + priv, true);
      setVisibleAll(".if-logged-in-not-" + priv, false);
    });
  }
  setVisibleAll(".if-not-logged-in", !is_logged_in);
}

registerPanel("login", show_login);
document.querySelector("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  do_login();
});
document.addEventListener("s5mail:credentials-changed", show_hide_menus);
export { show_hide_menus };
