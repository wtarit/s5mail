import { api } from "../api.js";
import { create_element, preformatted, query } from "../elements.js";
import { show_modal_error } from "../modal.js";
import { registerPanel } from "../state.js";

function show_external_dns() {
  api("/dns/zones", "GET", {}, function (data) {
    const zones = query("#downloadZonefile");
    zones.replaceChildren();
    for (var j = 0; j < data.length; j++) {
      zones.append(create_element("option", { textContent: data[j] }));
    }
  });

  const tableBody = query("#external_dns_settings tbody");
  tableBody.replaceChildren(
    create_element("tr", {}, [
      create_element("td", { colSpan: 2, className: "text-muted", textContent: "Loading..." }),
    ]),
  );
  api("/dns/dump", "GET", {}, function (zones) {
    tableBody.replaceChildren();
    for (var j = 0; j < zones.length; j++) {
      tableBody.append(
        create_element("tr", { className: "heading" }, [
          create_element("td", { colSpan: 3, textContent: zones[j][0] }),
        ]),
      );

      var r = zones[j][1];
      for (var i = 0; i < r.length; i++) {
        tableBody.append(
          create_element("tr", { className: "values" }, [
            create_element("td", { className: "qname", textContent: r[i].qname }),
            create_element("td", { className: "rtype", textContent: r[i].rtype }),
            create_element("td", { className: "value", textContent: r[i].value }),
          ]),
          create_element("tr", { className: "explanation" }, [
            create_element("td", { colSpan: 3, textContent: r[i].explanation }),
          ]),
        );
      }
    }
  });
}

function do_download_zonefile() {
  var zone = query("#downloadZonefile").value;

  api(
    "/dns/zonefile/" + zone,
    "GET",
    {},
    function (data) {
      show_modal_error("Download Zonefile", preformatted(data));
    },
    function (err) {
      show_modal_error("Download Zonefile (Error)", preformatted(err));
    },
  );
}

registerPanel("external_dns", show_external_dns);
document.querySelector("#panel_external_dns form").addEventListener("submit", (event) => {
  event.preventDefault();
  do_download_zonefile();
});
