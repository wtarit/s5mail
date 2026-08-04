import { api } from "../api.js";
import { create_element, preformatted, query, queryAll, setVisible } from "../elements.js";
import { show_modal_confirm, show_modal_error } from "../modal.js";
import { registerPanel } from "../state.js";

function show_aliases() {
  const tableBody = query("#alias_table tbody");
  tableBody.replaceChildren(
    create_element("tr", {}, [
      create_element("td", { colSpan: 2, className: "text-muted", textContent: "Loading..." }),
    ]),
  );
  api("/mail/aliases", "GET", { format: "json" }, function (r) {
    tableBody.replaceChildren();
    for (var i = 0; i < r.length; i++) {
      tableBody.append(
        create_element("tr", {}, [
          create_element("th", {
            role: "heading",
            ariaLevel: "4",
            colSpan: 4,
            style: "background-color: #EEE",
            textContent: r[i].domain,
          }),
        ]),
      );

      for (var k = 0; k < r[i].aliases.length; k++) {
        var alias = r[i].aliases[k];

        const row = query("#alias-template").cloneNode(true);
        row.removeAttribute("id");

        if (alias.auto) row.classList.add("alias-auto");
        row.dataset.address = alias.address_display; // decoded from IDNA; the backend re-encodes it
        query("td.address", row).textContent = alias.address_display;
        for (var j = 0; j < alias.forwards_to.length; j++)
          query("td.forwardsTo", row).append(
            create_element("div", { textContent: alias.forwards_to[j] }),
          );
        for (var j = 0; j < (alias.permitted_senders ? alias.permitted_senders.length : 0); j++)
          query("td.senders", row).append(
            create_element("div", { textContent: alias.permitted_senders[j] }),
          );
        tableBody.append(row);
      }
    }
  });
}

function set_alias_mode(button) {
  queryAll("#alias_type_buttons button").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  queryAll(
    "#addalias-form .regularalias, #addalias-form .catchall, #addalias-form .domainalias",
  ).forEach((item) => item.classList.add("hidden"));

  const address = query("#addaliasAddress");
  const forwards = query("#addaliasForwardsTo");
  const mode = button.dataset.mode;
  address.type = mode === "regular" ? "email" : "text";
  address.placeholder =
    mode === "regular"
      ? "you@yourdomain.com (incoming email address)"
      : "@yourdomain.com (incoming catch-all domain)";
  forwards.placeholder =
    mode === "domainalias"
      ? "@otherdomain.com (forward to other domain)"
      : "one address per line or separated by commas";
  setVisible(query("#alias_mode_info"), mode !== "regular");
  queryAll(`#addalias-form .${mode}`).forEach((item) => item.classList.remove("hidden"));
}

queryAll("#alias_type_buttons button").forEach((button) => {
  button.addEventListener("click", () => set_alias_mode(button));
});
set_alias_mode(query('#alias_type_buttons button[data-mode="regular"]'));

var is_alias_add_update = false;
function do_add_alias() {
  var title = !is_alias_add_update ? "Add Alias" : "Update Alias";
  var form_address = query("#addaliasAddress").value;
  var form_forwardsto = query("#addaliasForwardsTo").value;
  var form_senders = query("#addaliasForwardsToAdvanced").checked
    ? query("#addaliasSenders").value
    : "";
  if (query("#addaliasForwardsToAdvanced").checked && !/\S/.exec(query("#addaliasSenders").value)) {
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
      show_modal_error(title, preformatted(r));
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
  query("#addaliasAddress").disabled = false;
  query("#addaliasAddress").value = "";
  query("#addaliasForwardsTo").value = "";
  query("#addaliasSenders").value = "";
  query("#alias-cancel").classList.add("hidden");
  query("#add-alias-button").textContent = "Add Alias";
  is_alias_add_update = false;
}

function aliases_edit(elem) {
  const row = elem.closest("tr");
  var address = row.dataset.address;
  var forwardsTo = queryAll(".forwardsTo div", row)
    .map((item) => item.textContent)
    .join("\n");
  var senders = queryAll(".senders div", row)
    .map((item) => item.textContent)
    .join("\n");
  if (forwardsTo) forwardsTo += "\n";
  if (senders) senders += "\n";
  if (address.charAt(0) == "@" && forwardsTo.charAt(0) == "@")
    set_alias_mode(query('#alias_type_buttons button[data-mode="domainalias"]'));
  else if (address.charAt(0) == "@")
    set_alias_mode(query('#alias_type_buttons button[data-mode="catchall"]'));
  else set_alias_mode(query('#alias_type_buttons button[data-mode="regular"]'));
  query("#alias-cancel").classList.remove("hidden");
  query("#addaliasAddress").disabled = true;
  query("#addaliasAddress").value = address;
  query("#addaliasForwardsTo").value = forwardsTo;
  query("#addaliasForwardsToAdvanced").checked = senders !== "";
  query("#addaliasForwardsToNotAdvanced").checked = senders === "";
  query("#addaliasSenders").value = senders;
  query("#add-alias-button").textContent = "Update";
  window.scrollTo({ top: 0 });
  is_alias_add_update = true;
}

function aliases_remove(elem) {
  var row_address = elem.closest("tr").dataset.address;
  show_modal_confirm("Remove Alias", "Remove " + row_address + "?", "Remove", function () {
    api(
      "/mail/aliases/remove",
      "POST",
      {
        address: row_address,
      },
      function (r) {
        // Responses are multiple lines of pre-formatted text.
        show_modal_error("Remove Alias", preformatted(r));
        show_aliases();
      },
    );
  });
}

function scroll_top() {
  window.scrollTo({ top: query("#panel_aliases").getBoundingClientRect().top + window.scrollY });
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
      setVisible(query("#addaliasForwardsToDiv"), query("#addaliasForwardsToAdvanced").checked),
    ),
  );
