var el = {
  disableForm: document.getElementById("disable-2fa"),
  output: document.getElementById("output-2fa"),
  totpSetupForm: document.getElementById("totp-setup"),
  totpSetupToken: document.getElementById("totp-setup-token"),
  totpSetupSecret: document.getElementById("totp-setup-secret"),
  totpSetupLabel: document.getElementById("totp-setup-label"),
  totpQr: document.getElementById("totp-setup-qr"),
  totpSetupSubmit: document.querySelector("#totp-setup-submit"),
  wrapper: document.querySelector(".twofactor"),
};

function update_setup_disabled(evt) {
  var val = evt.target.value.trim();

  if (
    typeof val !== "string" ||
    typeof el.totpSetupSecret.value !== "string" ||
    val.length !== 6 ||
    el.totpSetupSecret.value.length !== 32 ||
    !/^\+?\d+$/.test(val)
  ) {
    el.totpSetupSubmit.setAttribute("disabled", "");
  } else {
    el.totpSetupSubmit.removeAttribute("disabled");
  }
}

function render_totp_setup(provisioned_totp) {
  var img = document.createElement("img");
  img.src = "data:image/png;base64," + provisioned_totp.qr_code_base64;
  img.alt = "QR code, scan this in your authenticator app";

  var code = document.createElement("div");
  code.textContent = `Secret: ${provisioned_totp.secret}`;

  el.totpQr.appendChild(img);
  el.totpQr.appendChild(code);

  el.totpSetupToken.addEventListener("input", update_setup_disabled);
  el.totpSetupForm.addEventListener("submit", do_enable_totp);

  el.totpSetupSecret.setAttribute("value", provisioned_totp.secret);

  el.wrapper.classList.add("disabled");
}

function render_disable(mfa) {
  el.disableForm.addEventListener("submit", do_disable);
  el.wrapper.classList.add("enabled");
  if (mfa.label) dom("#mfa-device-label").text(" on device '" + mfa.label + "'");
}

function hide_error() {
  el.output.querySelector(".panel-body").replaceChildren();
  el.output.classList.remove("visible");
}

function render_error(msg) {
  el.output.querySelector(".panel-body").textContent = msg;
  el.output.classList.add("visible");
}

function reset_view() {
  el.wrapper.classList.remove("loaded", "disabled", "enabled");

  el.disableForm.removeEventListener("submit", do_disable);

  hide_error();

  el.totpSetupForm.reset();
  el.totpSetupForm.removeEventListener("submit", do_enable_totp);

  el.totpSetupSecret.setAttribute("value", "");
  el.totpSetupToken.removeEventListener("input", update_setup_disabled);

  el.totpSetupSubmit.setAttribute("disabled", "");
  el.totpQr.replaceChildren();
}

import { api } from "../api.js";
import { dom } from "../dom.js";
import { registerPanel } from "../state.js";
import { doLogout } from "../session.js";

function show_mfa() {
  reset_view();

  api("/mfa/status", "POST", {}, function (res) {
    el.wrapper.classList.add("loaded");

    var has_mfa = false;
    res.enabled_mfa.forEach(function (mfa) {
      if (mfa.type == "totp") {
        render_disable(mfa);
        has_mfa = true;
      }
    });

    if (!has_mfa) render_totp_setup(res.new_mfa.totp);
  });
}

function do_disable(evt) {
  evt.preventDefault();
  hide_error();

  api("/mfa/disable", "POST", { type: "totp" }, function () {
    doLogout();
  });

  return false;
}

function do_enable_totp(evt) {
  evt.preventDefault();
  hide_error();

  api(
    "/mfa/totp/enable",
    "POST",
    {
      token: dom(el.totpSetupToken).val(),
      secret: dom(el.totpSetupSecret).val(),
      label: dom(el.totpSetupLabel).val(),
    },
    function () {
      doLogout();
    },
    function (res) {
      render_error(res);
    },
  );

  return false;
}

registerPanel("mfa", show_mfa);
