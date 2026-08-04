import { api } from "../api.js";
import { dom } from "../dom.js";
import { show_modal_error } from "../modal.js";
import { registerPanel } from "../state.js";

function show_custom_dns() {
  api("/dns/secondary-nameserver", "GET", {}, function (data) {
    dom("#secondarydnsHostname").val(data.hostnames.join(" "));
    dom("#secondarydns-clear-instructions").toggle(data.hostnames.length > 0);
  });

  api("/dns/zones", "GET", {}, function (data) {
    dom("#customdnsZone").text("");
    for (var i = 0; i < data.length; i++) {
      dom("#customdnsZone").append(dom("<option/>").text(data[i]));
    }
  });

  show_current_custom_dns();
  show_customdns_rtype_hint();
}

function show_current_custom_dns() {
  api("/dns/custom", "GET", {}, function (data) {
    if (data.length > 0) dom("#custom-dns-current").fadeIn();
    else dom("#custom-dns-current").fadeOut();
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

  var tbody = dom("#custom-dns-current").find("tbody");
  tbody.text("");
  var last_zone = null;
  for (var i = 0; i < data.length; i++) {
    if (sort_key == "qname" && data[i].zone != last_zone) {
      var r = dom(
        "<tr><th role='heading' aria-level='4' colspan=4 style='background-color: #EEE'></th></tr>",
      );
      r.find("th").text(data[i].zone);
      tbody.append(r);
      last_zone = data[i].zone;
    }

    var tr = dom("<tr/>");
    tbody.append(tr);
    tr.attr("data-qname", data[i].qname);
    tr.attr("data-rtype", data[i].rtype);
    tr.attr("data-value", data[i].value);
    tr.append(dom('<td class="long"/>').text(data[i].qname));
    tr.append(dom("<td/>").text(data[i].rtype));
    tr.append(dom('<td class="long" style="max-width: 40em"/>').text(data[i].value));
    tr.append(dom('<td>[<a href="#" data-dns-action="delete">delete</a>]</td>'));
  }
}

function delete_custom_dns_record(elem) {
  var qname = dom(elem).parents("tr").attr("data-qname");
  var rtype = dom(elem).parents("tr").attr("data-rtype");
  var value = dom(elem).parents("tr").attr("data-value");
  do_set_custom_dns(qname, rtype, value, "DELETE");
  return false;
}

function do_set_secondary_dns() {
  api(
    "/dns/secondary-nameserver",
    "POST",
    {
      hostnames: dom("#secondarydnsHostname").val(),
    },
    function (data) {
      if (data == "") return; // nothing updated
      show_modal_error("Secondary DNS", dom("<pre/>").text(data).get(0));
      dom("#secondarydns-clear-instructions").slideDown();
    },
    function (err) {
      show_modal_error("Secondary DNS", dom("<pre/>").text(err).get(0));
    },
  );
}

function do_set_custom_dns(qname, rtype, value, method) {
  if (!qname) {
    if (dom("#customdnsQname").val() != "")
      qname = dom("#customdnsQname").val() + "." + dom("#customdnsZone").val();
    else qname = dom("#customdnsZone").val();
    rtype = dom("#customdnsType").val();
    value = dom("#customdnsValue").val();
    method = "POST";
  }

  api(
    "/dns/custom/" + qname + "/" + rtype,
    method,
    value,
    function (data) {
      if (data == "") return; // nothing updated
      show_modal_error("Custom DNS", dom("<pre/>").text(data).get(0));
      show_current_custom_dns();
    },
    function (err) {
      show_modal_error("Custom DNS (Error)", dom("<pre/>").text(err).get(0));
    },
  );
}

function show_customdns_rtype_hint() {
  dom("#customdnsTypeHint").text(dom("#customdnsType").find("option:selected").attr("data-hint"));
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
