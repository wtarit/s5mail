import { api } from "../api.js";
import { dom } from "../dom.js";
import { create_element } from "../elements.js";
import { show_modal_confirm, show_modal_error } from "../modal.js";
import { registerPanel } from "../state.js";

function show_web() {
  api("/web/domains", "GET", {}, function (domains) {
    var tb = dom("#web_domains_existing tbody");
    tb.text("");
    for (var i = 0; i < domains.length; i++) {
      if (!domains[i].static_enabled) continue;
      var row = dom(
        "<tr><th scope='colgroup' class='domain'><a href=''></a></th><td class='directory'><tt/></td> <td class='change-root hidden'><button class='btn btn-default btn-xs' data-web-action='change-root'>Change</button></td></tr>",
      );
      tb.append(row);
      row.attr("data-domain", domains[i].domain);
      row.attr("data-custom-web-root", domains[i].custom_root);
      row.find(".domain a").text("https://" + domains[i].domain);
      row.find(".domain a").attr("href", "https://" + domains[i].domain);
      row.find(".directory tt").text(domains[i].root);
      if (domains[i].root != domains[i].custom_root) row.find(".change-root").removeClass("hidden");
    }
  });
}

function do_web_update() {
  api("/web/update", "POST", {}, function (data) {
    if (data == "") data = "Nothing changed.";
    else data = dom("<pre/>").text(data).get(0);
    show_modal_error("Web Update", data, function () {
      show_web();
    });
  });
}

function show_change_web_root(elem) {
  var domain = dom(elem).parents("tr").attr("data-domain");
  var root = dom(elem).parents("tr").attr("data-custom-web-root");
  show_modal_confirm(
    "Change Root Directory for " + domain,
    create_element("div", {}, [
      create_element("p", {}, [
        "You can change the static directory for ",
        create_element("tt", {}, [domain]),
        " to:",
      ]),
      create_element("p", {}, [create_element("tt", {}, [root])]),
      create_element("p", {
        textContent:
          "First create this directory on the server. Then click Update to scan for the directory and update web settings.",
      }),
    ]),
    "Update",
    function () {
      do_web_update();
    },
  );
}

registerPanel("web", show_web);
document.querySelector("#panel_web").addEventListener("click", (event) => {
  const action = event.target.closest("[data-web-action='change-root']");
  if (!action) return;
  event.preventDefault();
  show_change_web_root(action);
});
