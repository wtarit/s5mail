import { api } from "../api.js";
import { dom } from "../dom.js";
import { show_modal_error } from "../modal.js";
import { registerPanel } from "../state.js";

function show_external_dns() {
  api("/dns/zones", "GET", {}, function (data) {
    var zones = dom("#downloadZonefile");
    zones.text("");
    for (var j = 0; j < data.length; j++) {
      zones.append(dom("<option/>").text(data[j]));
    }
  });

  dom("#external_dns_settings tbody").html(
    "<tr><td colspan='2' class='text-muted'>Loading...</td></tr>",
  );
  api("/dns/dump", "GET", {}, function (zones) {
    dom("#external_dns_settings tbody").html("");
    for (var j = 0; j < zones.length; j++) {
      var h = dom("<tr class='heading'><td colspan='3'></td></tr>");
      h.find("td").text(zones[j][0]);
      dom("#external_dns_settings tbody").append(h);

      var r = zones[j][1];
      for (var i = 0; i < r.length; i++) {
        var n = dom(
          "<tr class='values'><td class='qname'/><td class='rtype'/><td class='value'/></tr>",
        );
        n.find(".qname").text(r[i].qname);
        n.find(".rtype").text(r[i].rtype);
        n.find(".value").text(r[i].value);
        dom("#external_dns_settings tbody").append(n);

        var n = dom("<tr class='explanation'><td colspan='3'/></tr>");
        n.find("td").text(r[i].explanation);
        dom("#external_dns_settings tbody").append(n);
      }
    }
  });
}

function do_download_zonefile() {
  var zone = dom("#downloadZonefile").val();

  api(
    "/dns/zonefile/" + zone,
    "GET",
    {},
    function (data) {
      show_modal_error("Download Zonefile", dom("<pre/>").text(data).get(0));
    },
    function (err) {
      show_modal_error("Download Zonefile (Error)", dom("<pre/>").text(err).get(0));
    },
  );
}

registerPanel("external_dns", show_external_dns);
document.querySelector("#panel_external_dns form").addEventListener("submit", (event) => {
  event.preventDefault();
  do_download_zonefile();
});
