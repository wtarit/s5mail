import { api } from "../api.js";
import { dom } from "../dom.js";
import { show_modal_confirm, show_modal_error } from "../modal.js";
import { registerPanel } from "../state.js";

function show_aliases() {
  dom("#alias_table tbody").html("<tr><td colspan='2' class='text-muted'>Loading...</td></tr>");
  api("/mail/aliases", "GET", { format: "json" }, function (r) {
    dom("#alias_table tbody").html("");
    for (var i = 0; i < r.length; i++) {
      var hdr = dom(
        "<tr><th role='heading' aria-level='4' colspan='4' style='background-color: #EEE'></th></tr>",
      );
      hdr.find("th").text(r[i].domain);
      dom("#alias_table tbody").append(hdr);

      for (var k = 0; k < r[i].aliases.length; k++) {
        var alias = r[i].aliases[k];

        var n = dom("#alias-template").clone();
        n.attr("id", "");

        if (alias.auto) n.addClass("alias-auto");
        n.attr("data-address", alias.address_display); // this is decoded from IDNA, but will get re-coded to IDNA on the backend
        n.find("td.address").text(alias.address_display);
        for (var j = 0; j < alias.forwards_to.length; j++)
          n.find("td.forwardsTo").append(dom("<div></div>").text(alias.forwards_to[j]));
        for (var j = 0; j < (alias.permitted_senders ? alias.permitted_senders.length : 0); j++)
          n.find("td.senders").append(dom("<div></div>").text(alias.permitted_senders[j]));
        dom("#alias_table tbody").append(n);
      }
    }
  });

  dom(function () {
    dom("#alias_type_buttons button")
      .off("click")
      .click(function () {
        dom("#alias_type_buttons button").removeClass("active");
        dom(this).addClass("active");
        dom(
          "#addalias-form .regularalias, #addalias-form .catchall, #addalias-form .domainalias",
        ).addClass("hidden");
        if (dom(this).attr("data-mode") == "regular") {
          dom("#addaliasAddress").attr("type", "email");
          dom("#addaliasAddress").attr(
            "placeholder",
            "you@yourdomain.com (incoming email address)",
          );
          dom("#addaliasForwardsTo").attr(
            "placeholder",
            "one address per line or separated by commas",
          );
          dom("#alias_mode_info").slideUp();
          dom("#addalias-form .regularalias").removeClass("hidden");
        } else if (dom(this).attr("data-mode") == "catchall") {
          dom("#addaliasAddress").attr("type", "text");
          dom("#addaliasAddress").attr(
            "placeholder",
            "@yourdomain.com (incoming catch-all domain)",
          );
          dom("#addaliasForwardsTo").attr(
            "placeholder",
            "one address per line or separated by commas",
          );
          dom("#alias_mode_info").slideDown();
          dom("#addalias-form .catchall").removeClass("hidden");
        } else if (dom(this).attr("data-mode") == "domainalias") {
          dom("#addaliasAddress").attr("type", "text");
          dom("#addaliasAddress").attr(
            "placeholder",
            "@yourdomain.com (incoming catch-all domain)",
          );
          dom("#addaliasForwardsTo").attr(
            "placeholder",
            "@otherdomain.com (forward to other domain)",
          );
          dom("#alias_mode_info").slideDown();
          dom("#addalias-form .domainalias").removeClass("hidden");
        }
      });
    dom('#alias_type_buttons button[data-mode="regular"]').click(); // init
  });
}

var is_alias_add_update = false;
function do_add_alias() {
  var title = !is_alias_add_update ? "Add Alias" : "Update Alias";
  var form_address = dom("#addaliasAddress").val();
  var form_forwardsto = dom("#addaliasForwardsTo").val();
  var form_senders = dom("#addaliasForwardsToAdvanced").prop("checked")
    ? dom("#addaliasSenders").val()
    : "";
  if (
    dom("#addaliasForwardsToAdvanced").prop("checked") &&
    !/\S/.exec(dom("#addaliasSenders").val())
  ) {
    show_modal_error(title, "You did not enter any permitted senders.");
    return false;
  }
  api(
    "/mail/aliases/add",
    "POST",
    {
      update_if_exists: is_alias_add_update ? "1" : "0",
      address: form_address,
      forwards_to: form_forwardsto,
      permitted_senders: form_senders,
    },
    function (r) {
      // Responses are multiple lines of pre-formatted text.
      show_modal_error(title, dom("<pre/>").text(r).get(0));
      show_aliases();
      aliases_reset_form();
    },
    function (r) {
      show_modal_error(title, r);
    },
  );
  return false;
}

function aliases_reset_form() {
  dom("#addaliasAddress").prop("disabled", false);
  dom("#addaliasAddress").val("");
  dom("#addaliasForwardsTo").val("");
  dom("#addaliasSenders").val("");
  dom("#alias-cancel").addClass("hidden");
  dom("#add-alias-button").text("Add Alias");
  is_alias_add_update = false;
}

function aliases_edit(elem) {
  var address = dom(elem).parents("tr").attr("data-address");
  var receiverdivs = dom(elem).parents("tr").find(".forwardsTo div");
  var senderdivs = dom(elem).parents("tr").find(".senders div");
  var forwardsTo = "";
  for (var i = 0; i < receiverdivs.length; i++) forwardsTo += dom(receiverdivs[i]).text() + "\n";
  var senders = "";
  for (var i = 0; i < senderdivs.length; i++) senders += dom(senderdivs[i]).text() + "\n";
  if (address.charAt(0) == "@" && forwardsTo.charAt(0) == "@")
    dom('#alias_type_buttons button[data-mode="domainalias"]').click();
  else if (address.charAt(0) == "@")
    dom('#alias_type_buttons button[data-mode="catchall"]').click();
  else dom('#alias_type_buttons button[data-mode="regular"]').click();
  dom("#alias-cancel").removeClass("hidden");
  dom("#addaliasAddress").prop("disabled", true);
  dom("#addaliasAddress").val(address);
  dom("#addaliasForwardsTo").val(forwardsTo);
  dom("#addaliasForwardsToAdvanced").prop("checked", senders != "");
  dom("#addaliasForwardsToNotAdvanced").prop("checked", senders == "");
  dom("#addaliasSenders").val(senders);
  dom("#add-alias-button").text("Update");
  dom("body").animate({ scrollTop: 0 });
  is_alias_add_update = true;
}

function aliases_remove(elem) {
  var row_address = dom(elem).parents("tr").attr("data-address");
  show_modal_confirm("Remove Alias", "Remove " + row_address + "?", "Remove", function () {
    api(
      "/mail/aliases/remove",
      "POST",
      {
        address: row_address,
      },
      function (r) {
        // Responses are multiple lines of pre-formatted text.
        show_modal_error("Remove Alias", dom("<pre/>").text(r).get(0));
        show_aliases();
      },
    );
  });
}

function scroll_top() {
  dom("html, body").animate(
    {
      scrollTop: dom("#panel_aliases").offset().top,
    },
    1000,
  );
}

registerPanel("aliases", show_aliases);
document.querySelector("#addalias-form").addEventListener("submit", (event) => {
  event.preventDefault();
  do_add_alias();
});
document.querySelector("#panel_aliases").addEventListener("click", (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;
  if (target.matches("#alias-cancel")) aliases_reset_form();
  else if (target.matches(".edit")) {
    aliases_edit(target);
    scroll_top();
  } else if (target.matches(".remove")) aliases_remove(target);
  else if (target.dataset.mode) return;
  else return;
  event.preventDefault();
});
document
  .querySelectorAll("[name='addaliasForwardsToDivToggle']")
  .forEach((radio) =>
    radio.addEventListener("change", () =>
      dom("#addaliasForwardsToDiv").toggle(
        document.querySelector("#addaliasForwardsToAdvanced").checked,
      ),
    ),
  );
