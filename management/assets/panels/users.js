import { api } from "../api.js";
import { create_element, preformatted, query } from "../elements.js";
import { show_modal_confirm, show_modal_error } from "../modal.js";
import { getCredentials, registerPanel } from "../state.js";
import { show_users } from "./users-list.js";

function do_add_user() {
  var email = query("#adduserEmail").value;
  var pw = query("#adduserPassword").value;
  var privs = query("#adduserPrivs").value;
  var quota = query("#adduserQuota").value;
  api(
    "/mail/users/add",
    "POST",
    {
      email: email,
      password: pw,
      privileges: privs,
      quota: quota,
    },
    function (r) {
      // Responses are multiple lines of pre-formatted text.
      show_modal_error("Add User", preformatted(r));
      show_users();
    },
    function (r) {
      show_modal_error("Add User", r);
    },
  );
  return false;
}

function users_set_password(elem) {
  var api_credentials = getCredentials();
  var email = elem.closest("tr").dataset.email;

  var content = create_element("div", {}, [
    create_element("p", {}, ["Set a new password for ", create_element("b", {}, [email]), "?"]),
    create_element("p", {}, [
      create_element("label", {
        htmlFor: "users_set_password_pw",
        textContent: "New Password:",
        style: "display: block; font-weight: normal",
      }),
      create_element("input", { type: "password", id: "users_set_password_pw" }),
    ]),
    create_element("p", {}, [
      create_element("small", {
        textContent: "Passwords must be at least eight characters and may not contain spaces.",
      }),
    ]),
  ]);
  if (api_credentials != null && email == api_credentials.username)
    content.append(
      create_element("p", {
        className: "text-danger",
        textContent:
          "If you change your own password, you will be logged out of this control panel and will need to log in again.",
      }),
    );

  show_modal_confirm("Set Password", content, "Set Password", function () {
    api(
      "/mail/users/password",
      "POST",
      {
        email: email,
        password: query("#users_set_password_pw").value,
      },
      function (r) {
        // Responses are multiple lines of pre-formatted text.
        show_modal_error("Set Password", preformatted(r));
      },
      function (r) {
        show_modal_error("Set Password", r);
      },
    );
  });
}

function users_set_quota(elem) {
  const row = elem.closest("tr");
  var email = row.dataset.email;
  var quota = row.dataset.quota;

  show_modal_confirm(
    "Set Quota",
    create_element("div", {}, [
      create_element("p", {}, ["Set quota for ", create_element("b", {}, [email]), "?"]),
      create_element("p", {}, [
        create_element("label", {
          htmlFor: "users_set_quota",
          textContent: "Quota:",
          style: "display: block; font-weight: normal",
        }),
        create_element("input", { type: "text", id: "users_set_quota", value: quota }),
      ]),
      create_element("p", {}, [
        create_element("small", {
          textContent: "Quotas may not contain spaces or commas. Suffixes of G and M are allowed.",
        }),
      ]),
      create_element("p", {}, [
        create_element("small", { textContent: "For unlimited storage enter 0 (zero)." }),
      ]),
    ]),
    "Set Quota",
    function () {
      api(
        "/mail/users/quota",
        "POST",
        {
          email: email,
          quota: query("#users_set_quota").value,
        },
        function () {
          show_users();
        },
        function (error) {
          show_modal_error("Set Quota", error);
        },
      );
    },
  );
}

function users_remove(elem) {
  var api_credentials = getCredentials();
  var email = elem.closest("tr").dataset.email;

  // can't remove yourself
  if (api_credentials != null && email == api_credentials.username) {
    show_modal_error("Archive User", "You cannot archive your own account.");
    return;
  }

  show_modal_confirm(
    "Archive User",
    create_element("div", {}, [
      create_element("p", {}, [
        "Are you sure you want to archive ",
        create_element("b", {}, [email]),
        "?",
      ]),
      create_element("p", {
        textContent:
          "The user's mailboxes will not be deleted, but the user will no longer be able to log into services on this machine.",
      }),
    ]),
    "Archive",
    function () {
      api(
        "/mail/users/remove",
        "POST",
        {
          email: email,
        },
        function (r) {
          // Responses are multiple lines of pre-formatted text.
          show_modal_error("Remove User", preformatted(r));
          show_users();
        },
        function (r) {
          show_modal_error("Remove User", r);
        },
      );
    },
  );
}

function mod_priv(elem, add_remove) {
  var api_credentials = getCredentials();
  var email = elem.closest("tr").dataset.email;
  var priv = query(".name", elem.closest("td")).textContent;

  // can't remove your own admin access
  if (
    priv == "admin" &&
    add_remove == "remove" &&
    api_credentials != null &&
    email == api_credentials.username
  ) {
    show_modal_error("Modify Privileges", "You cannot remove the admin privilege from yourself.");
    return;
  }

  var add_remove1 = add_remove.charAt(0).toUpperCase() + add_remove.substring(1);
  show_modal_confirm(
    "Modify Privileges",
    create_element("p", {}, [
      "Are you sure you want to ",
      add_remove,
      " the ",
      priv,
      " privilege for ",
      create_element("b", {}, [email]),
      "?",
    ]),
    add_remove1,
    function () {
      api(
        "/mail/users/privileges/" + add_remove,
        "POST",
        {
          email: email,
          privilege: priv,
        },
        function () {
          show_users();
        },
      );
    },
  );
}

function generate_random_password() {
  var pw = "";
  var charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // confusable characters skipped
  for (var i = 0; i < 12; i++) pw += charset.charAt(Math.floor(Math.random() * charset.length));
  show_modal_error(
    "Random Password",
    create_element("div", {}, [
      create_element("p", { textContent: "Here, try this:" }),
      create_element("p", {}, [
        create_element("code", { textContent: pw, style: "font-size: 110%" }),
      ]),
    ]),
  );
  return false; // cancel click
}

registerPanel("users", show_users);
export {
  do_add_user,
  generate_random_password,
  mod_priv,
  users_remove,
  users_set_password,
  users_set_quota,
};
