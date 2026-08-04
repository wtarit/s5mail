import { api } from "../api.js";
import { create_element, preformatted, query, setVisible } from "../elements.js";
import { show_modal_error } from "../modal.js";
import { registerPanel } from "../state.js";

function show_custom_dns() {
  api("/dns/secondary-nameserver", "GET", {}, function (data) {
    query("#secondarydnsHostname").value = data.hostnames.join(" ");
    setVisible(query("#secondarydns-clear-instructions"), data.hostnames.length > 0);
  });

  api("/dns/zones", "GET", {}, function (data) {
    const zone = query("#customdnsZone");
    zone.replaceChildren();
    for (var i = 0; i < data.length; i++) {
      zone.append(create_element("option", { textContent: data[i] }));
    }
  });

  show_current_custom_dns();
  show_customdns_rtype_hint();
}

function show_current_custom_dns() {
  api("/dns/custom", "GET", {}, function (data) {
    setVisible(query("#custom-dns-current"), data.length > 0);
    window.miab_custom_dns_data = data;
    show_current_custom_dns_update_after_sort();
  });
}

function show_current_custom_dns_update_after_sort() {
  var data = window.miab_custom_dns_data;
  var sort_key = window.miab_custom_dns_data_sort_order || "qname";

  data.sort(function (a, b) {
    return a["sort-order"][sort_key] - b["sort-order"][sort_key];
  });

  const tbody = query("#custom-dns-current tbody");
  tbody.replaceChildren();
  var last_zone = null;
  for (var i = 0; i < data.length; i++) {
    if (sort_key == "qname" && data[i].zone != last_zone) {
      tbody.append(
        create_element("tr", {}, [
          create_element("th", {
            role: "heading",
            ariaLevel: "4",
            colSpan: 4,
            style: "background-color: #EEE",
            textContent: data[i].zone,
          }),
        ]),
      );
      last_zone = data[i].zone;
    }

    const tr = create_element("tr");
    tbody.append(tr);
    tr.dataset.qname = data[i].qname;
    tr.dataset.rtype = data[i].rtype;
    tr.dataset.value = data[i].value;
    const deleteLink = create_element("a", { href: "#", textContent: "delete" });
    deleteLink.dataset.dnsAction = "delete";
    tr.append(
      create_element("td", { className: "long", textContent: data[i].qname }),
      create_element("td", { textContent: data[i].rtype }),
      create_element("td", {
        className: "long",
        style: "max-width: 40em",
        textContent: data[i].value,
      }),
      create_element("td", {}, ["[", deleteLink, "]"]),
    );
  }
}

function delete_custom_dns_record(elem) {
  const row = elem.closest("tr");
  var qname = row.dataset.qname;
  var rtype = row.dataset.rtype;
  var value = row.dataset.value;
  do_set_custom_dns(qname, rtype, value, "DELETE");
  return false;
}

function do_set_secondary_dns() {
  api(
    "/dns/secondary-nameserver",
    "POST",
    {
      hostnames: query("#secondarydnsHostname").value,
    },
    function (data) {
      if (data == "") return; // nothing updated
      show_modal_error("Secondary DNS", preformatted(data));
      setVisible(query("#secondarydns-clear-instructions"), true);
    },
    function (err) {
      show_modal_error("Secondary DNS", preformatted(err));
    },
  );
}

function do_set_custom_dns(qname, rtype, value, method) {
  if (!qname) {
    if (query("#customdnsQname").value !== "")
      qname = query("#customdnsQname").value + "." + query("#customdnsZone").value;
    else qname = query("#customdnsZone").value;
    rtype = query("#customdnsType").value;
    value = query("#customdnsValue").value;
    method = "POST";
  }

  api(
    "/dns/custom/" + qname + "/" + rtype,
    method,
    value,
    function (data) {
      if (data == "") return; // nothing updated
      show_modal_error("Custom DNS", preformatted(data));
      show_current_custom_dns();
    },
    function (err) {
      show_modal_error("Custom DNS (Error)", preformatted(err));
    },
  );
}

function show_customdns_rtype_hint() {
  query("#customdnsTypeHint").textContent =
    query("#customdnsType").selectedOptions[0]?.dataset.hint || "";
}

registerPanel("custom_dns", show_custom_dns);
const customForms = document.querySelectorAll("#panel_custom_dns form");
customForms[0].addEventListener("submit", (event) => {
  event.preventDefault();
  do_set_custom_dns();
});
customForms[1].addEventListener("submit", (event) => {
  event.preventDefault();
  do_set_secondary_dns();
});
document.querySelector("#customdnsType").addEventListener("change", show_customdns_rtype_hint);
document.querySelector("#panel_custom_dns").addEventListener("click", (event) => {
  const action = event.target.closest("[data-dns-action]");
  if (!action) return;
  event.preventDefault();
  if (action.dataset.dnsAction === "delete") delete_custom_dns_record(action);
  else {
    window.miab_custom_dns_data_sort_order = action.dataset.dnsAction;
    show_current_custom_dns_update_after_sort();
  }
});
