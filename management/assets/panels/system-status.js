import { api } from "../api.js";
import { create_element, query, setVisible } from "../elements.js";
import { show_modal_confirm, show_modal_error } from "../modal.js";
import { registerPanel } from "../state.js";

function show_system_status() {
  const summary = query("#system-checks-summary");
  summary.replaceChildren();

  const tableBody = query("#system-checks tbody");
  tableBody.replaceChildren(
    create_element("tr", {}, [
      create_element("td", { colSpan: 2, className: "text-muted", textContent: "Loading..." }),
    ]),
  );

  api("/system/privacy", "GET", {}, function (r) {
    current_privacy_setting = r;
    setVisible(query("#system-privacy-setting"), true);
    query("#system-privacy-setting a span").textContent = r ? "Enable" : "Disable";
    setVisible(query("#system-privacy-setting p"), r);
  });

  api("/system/reboot", "GET", {}, function (r) {
    const reboot = query("#system-reboot-required");
    setVisible(reboot, true); // show when r becomes available
    setVisible(query("button", reboot), r);
    setVisible(query("div", reboot), !r);
  });

  api("/system/status", "POST", {}, function (r) {
    tableBody.replaceChildren();
    const ok_symbol = "✓";
    const error_symbol = "✖";
    const warning_symbol = "?";

    let count_by_status = { ok: 0, error: 0, warning: 0 };

    for (var i = 0; i < r.length; i++) {
      const statusCell = create_element("td", { className: "status" });
      const message = create_element("p", { style: "margin: 0", textContent: r[i].text });
      const extra = create_element("div", { className: "extra", hidden: true });
      const showMore = create_element("a", { className: "showhide", href: "#", hidden: true });
      const row = create_element("tr", {}, [
        statusCell,
        create_element("td", { className: "message" }, [message, extra, showMore]),
      ]);
      if (i == 0) row.classList.add("first");
      if (r[i].type == "heading") row.classList.add(r[i].type);
      else row.classList.add("status-" + r[i].type);

      if (r[i].type == "ok") statusCell.textContent = ok_symbol;
      if (r[i].type == "error") statusCell.textContent = error_symbol;
      if (r[i].type == "warning") statusCell.textContent = warning_symbol;
      count_by_status[r[i].type]++;

      tableBody.append(row);

      if (r[i].extra.length > 0) {
        setVisible(showMore, true);
        showMore.textContent = "show more";
        showMore.addEventListener("click", (event) => {
          event.preventDefault();
          setVisible(showMore, false);
          setVisible(extra, true);
        });
      }

      for (var j = 0; j < r[i].extra.length; j++) {
        var detail = create_element("div", { textContent: r[i].extra[j].text });
        if (r[i].extra[j].monospace) detail.classList.add("pre");
        extra.append(detail);
      }
    }

    // Summary counts
    summary.append("Summary: ");
    if (count_by_status["error"] + count_by_status["warning"] == 0) {
      summary.append(
        create_element("span", {
          className: "summary-ok",
          textContent: `All ${count_by_status["ok"]} ${ok_symbol} OK`,
        }),
      );
    } else {
      summary.append(
        create_element("span", {
          className: "summary-ok",
          textContent: `${count_by_status["ok"]} ${ok_symbol} OK, `,
        }),
        create_element("span", {
          className: "summary-error",
          textContent: `${count_by_status["error"]} ${error_symbol} Error, `,
        }),
        create_element("span", {
          className: "summary-warning",
          textContent: `${count_by_status["warning"]} ${warning_symbol} Warning`,
        }),
      );
    }
  });
}

var current_privacy_setting = null;
function enable_privacy(status) {
  api(
    "/system/privacy",
    "POST",
    {
      value: status ? "private" : "off",
    },
    function () {
      show_system_status();
    },
  );
  return false; // disable link
}

function confirm_reboot() {
  show_modal_confirm(
    "Reboot",
    create_element("div", {}, [
      create_element("p", {}, [
        "This will reboot your Mail-in-a-Box ",
        create_element("code", { textContent: "{{hostname}}" }),
        ".",
      ]),
      create_element("p", {
        textContent:
          "Until the machine is fully restarted, users cannot send or receive email and you cannot connect to this control panel or SSH. The reboot cannot be cancelled.",
      }),
    ]),
    "Reboot Now",
    function () {
      api("/system/reboot", "POST", {}, function (r) {
        var msg = "Please reload this page after a minute or so.";
        if (r)
          msg = create_element("div", {}, [
            create_element("p", { textContent: "The reboot command said:" }),
            create_element("pre", { textContent: r }),
          ]);
        show_modal_error("Reboot", msg);
      });
    },
  );
}

registerPanel("system_status", show_system_status);
document.querySelector("#panel_system_status").addEventListener("click", (event) => {
  const action = event.target.closest("[data-system-action]");
  if (!action) return;
  event.preventDefault();
  if (action.dataset.systemAction === "reboot") confirm_reboot();
  else enable_privacy(!current_privacy_setting);
});
