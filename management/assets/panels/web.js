import { api } from "../api.js";
import { create_element, preformatted, query } from "../elements.js";
import { show_modal_confirm, show_modal_error } from "../modal.js";
import { registerPanel } from "../state.js";

function show_web() {
  api("/web/domains", "GET", {}, function (domains) {
    const tableBody = query("#web_domains_existing tbody");
    tableBody.replaceChildren();
    for (var i = 0; i < domains.length; i++) {
      if (!domains[i].static_enabled) continue;
      const link = create_element("a", {
        href: "https://" + domains[i].domain,
        textContent: "https://" + domains[i].domain,
      });
      const changeCell = create_element("td", { className: "change-root hidden" }, [
        create_element("button", {
          className: "btn btn-default btn-xs",
          textContent: "Change",
        }),
      ]);
      query("button", changeCell).dataset.webAction = "change-root";
      const row = create_element("tr", {}, [
        create_element("th", { scope: "colgroup", className: "domain" }, [link]),
        create_element("td", { className: "directory" }, [
          create_element("tt", { textContent: domains[i].root }),
        ]),
        changeCell,
      ]);
      row.dataset.domain = domains[i].domain;
      row.dataset.customWebRoot = domains[i].custom_root;
      if (domains[i].root != domains[i].custom_root) changeCell.classList.remove("hidden");
      tableBody.append(row);
    }
  });
}

function do_web_update() {
  api("/web/update", "POST", {}, function (data) {
    if (data == "") data = "Nothing changed.";
    else data = preformatted(data);
    show_modal_error("Web Update", data, function () {
      show_web();
    });
  });
}

function show_change_web_root(elem) {
  const row = elem.closest("tr");
  var domain = row.dataset.domain;
  var root = row.dataset.customWebRoot;
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
