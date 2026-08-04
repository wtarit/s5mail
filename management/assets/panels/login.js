import { api } from "../api.js";
import { dom } from "../dom.js";
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
  if (dom("#loginEmail").val() == "") {
    show_modal_error("Login Failed", "Enter your email address.", function () {
      dom("#loginEmail").focus();
    });
    return false;
  }

  if (dom("#loginPassword").val() == "") {
    show_modal_error("Login Failed", "Enter your email password.", function () {
      dom("#loginPassword").focus();
    });
    return false;
  }

  // Exchange the email address & password for an API key.
  setCredentials({ username: dom("#loginEmail").val(), session_key: dom("#loginPassword").val() });

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
          dom("#loginForm").addClass("is-twofactor");
          if (response.reason === "invalid-totp-token") {
            show_modal_error("Login Failed", "Incorrect two factor authentication token.");
          } else {
            setTimeout(() => {
              dom("#loginOtpInput").focus();
            });
          }
        } else {
          dom("#loginForm").removeClass("is-twofactor");

          // Show why the login failed.
          show_modal_error("Login Failed", response.reason);

          // Reset any saved credentials.
          doLogout();
        }
      } else if (!("api_key" in response)) {
        // Login succeeded but user might not be authorized!
        show_modal_error("Login Failed", "You are not an administrator on this system.");

        // Reset any saved credentials.
        doLogout();
      } else {
        // Login succeeded.

        // Save the new credentials.
        setCredentials({
          username: response.email,
          session_key: response.api_key,
          privileges: response.privileges,
        });
        var api_credentials = getCredentials();

        // Try to wipe the username/password information.
        dom("#loginEmail").val("");
        dom("#loginPassword").val("");
        dom("#loginOtpInput").val("");
        dom("#loginForm").removeClass("is-twofactor");

        // Remember the credentials.
        if (typeof localStorage != "undefined" && typeof sessionStorage != "undefined") {
          if (dom("#loginRemember").prop("checked")) {
            localStorage.setItem("miab-cp-credentials", JSON.stringify(api_credentials));
            sessionStorage.removeItem("miab-cp-credentials");
          } else {
            localStorage.removeItem("miab-cp-credentials");
            sessionStorage.setItem("miab-cp-credentials", JSON.stringify(api_credentials));
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
      "x-auth-token": dom("#loginOtpInput").val(),
    },
  );
}

function show_login() {
  dom("#loginForm").removeClass("is-twofactor");
  dom("#loginOtpInput").val("");
  dom("#loginEmail,#loginPassword").each(function () {
    var input = dom(this);
    if (!dom.trim(input.val())) {
      input.focus();
      return false;
    }
  });
}

function show_hide_menus() {
  var api_credentials = getCredentials();
  var is_logged_in = api_credentials != null;
  var privs = api_credentials ? api_credentials.privileges : [];
  dom(".if-logged-in").toggle(is_logged_in);
  dom(".if-logged-in-admin, .if-logged-in-not-admin").toggle(false);
  if (is_logged_in) {
    dom(".if-logged-in-not-admin").toggle(true);
    privs.forEach(function (priv) {
      dom(".if-logged-in-" + priv).toggle(true);
      dom(".if-logged-in-not-" + priv).toggle(false);
    });
  }
  dom(".if-not-logged-in").toggle(!is_logged_in);
}

registerPanel("login", show_login);
document.querySelector("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  do_login();
});
document.addEventListener("miab:credentials-changed", show_hide_menus);
export { show_hide_menus };
