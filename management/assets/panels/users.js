import { api } from "../api.js";
import { dom } from "../dom.js";
import { create_element } from "../elements.js";
import { show_modal_confirm, show_modal_error } from "../modal.js";
import { getCredentials, registerPanel } from "../state.js";

function show_users() {
  dom("#user_table tbody").html("<tr><td colspan='2' class='text-muted'>Loading...</td></tr>");
  api("/mail/users", "GET", { format: "json" }, function (r) {
    dom("#user_table tbody").html("");
    for (var i = 0; i < r.length; i++) {
      var hdr = dom(
        "<tr><th role='heading' aria-level='4' colspan='6' style='background-color: #EEE'></th></tr>",
      );
      hdr.find("th").text(r[i].domain);
      dom("#user_table tbody").append(hdr);

      for (var k = 0; k < r[i].users.length; k++) {
        var user = r[i].users[k];

        var n = dom("#user-template").clone();
        var n2 = dom("#user-extra-template").clone();
        n.attr("id", "");
        n2.attr("id", "");
        dom("#user_table tbody").append(n);
        dom("#user_table tbody").append(n2);

        n.addClass("account_" + user.status);
        n2.addClass("account_" + user.status);

        n.attr("data-email", user.email);
        n.attr("data-quota", user.quota);
        n.find(".address").text(user.email);
        n.find(".box-size").text(user.box_size);
        if (user.box_size == "?") {
          n.find(".box-size").attr("title", "Mailbox size is unkown");
        }
        n.find(".percent").text(user.percent);
        n.find(".quota").text(user.quota == "0" ? "unlimited" : user.quota);
        n2.find(".restore_info tt").text(user.mailbox);

        if (user.status == "inactive") continue;

        var add_privs = ["admin"];

        for (var j = 0; j < user.privileges.length; j++) {
          var p = dom(
            "<span><b><span class='name'></span></b> (<a href='#' data-privilege-action='remove' title='Remove Privilege'>remove privilege</a>) |</span>",
          );
          p.find("span.name").text(user.privileges[j]);
          n.find(".privs").append(p);
          if (add_privs.indexOf(user.privileges[j]) >= 0)
            add_privs.splice(add_privs.indexOf(user.privileges[j]), 1);
        }

        for (var j = 0; j < add_privs.length; j++) {
          var p = dom(
            "<span><a href='#' data-privilege-action='add' title='Add Privilege'>make <span class='name'></span></a> | </span>",
          );
          p.find("span.name").text(add_privs[j]);
          n.find(".add-privs").append(p);
        }
      }
    }
  });
}

function do_add_user() {
  var email = dom("#adduserEmail").val();
  var pw = dom("#adduserPassword").val();
  var privs = dom("#adduserPrivs").val();
  var quota = dom("#adduserQuota").val();
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
      show_modal_error("Add User", dom("<pre/>").text(r).get(0));
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
  var email = dom(elem).parents("tr").attr("data-email");

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
        password: dom("#users_set_password_pw").val(),
      },
      function (r) {
        // Responses are multiple lines of pre-formatted text.
        show_modal_error("Set Password", dom("<pre/>").text(r).get(0));
      },
      function (r) {
        show_modal_error("Set Password", r);
      },
    );
  });
}

function users_set_quota(elem) {
  var email = dom(elem).parents("tr").attr("data-email");
  var quota = dom(elem).parents("tr").attr("data-quota");

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
          quota: dom("#users_set_quota").val(),
        },
        function () {
          show_users();
        },
        function () {
          show_modal_error("Set Quota", r);
        },
      );
    },
  );
}

function users_remove(elem) {
  var api_credentials = getCredentials();
  var email = dom(elem).parents("tr").attr("data-email");

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
          show_modal_error("Remove User", dom("<pre/>").text(r).get(0));
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
  var email = dom(elem).parents("tr").attr("data-email");
  var priv = dom(elem).parents("td").find(".name").text();

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
