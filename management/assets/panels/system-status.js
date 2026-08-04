import { api } from "../api.js";
import { dom } from "../dom.js";
import { create_element } from "../elements.js";
import { show_modal_confirm, show_modal_error } from "../modal.js";
import { registerPanel } from "../state.js";

function show_system_status() {
  const summary = dom("#system-checks-summary");
  summary.html("");

  dom("#system-checks tbody").html("<tr><td colspan='2' class='text-muted'>Loading...</td></tr>");

  api("/system/privacy", "GET", {}, function (r) {
    current_privacy_setting = r;
    dom("#system-privacy-setting").show();
    dom("#system-privacy-setting a span").text(r ? "Enable" : "Disable");
    dom("#system-privacy-setting p").toggle(r);
  });

  api("/system/reboot", "GET", {}, function (r) {
    dom("#system-reboot-required").show(); // show when r becomes available
    dom("#system-reboot-required").find("button").toggle(r);
    dom("#system-reboot-required").find("div").toggle(!r);
  });

  api("/system/status", "POST", {}, function (r) {
    dom("#system-checks tbody").html("");
    const ok_symbol = "✓";
    const error_symbol = "✖";
    const warning_symbol = "?";

    let count_by_status = { ok: 0, error: 0, warning: 0 };

    for (var i = 0; i < r.length; i++) {
      var n = dom(
        "<tr><td class='status'/><td class='message'><p style='margin: 0'/><div class='extra'/><a class='showhide' href='#'/></tr>",
      );
      if (i == 0) n.addClass("first");
      if (r[i].type == "heading") n.addClass(r[i].type);
      else n.addClass("status-" + r[i].type);

      if (r[i].type == "ok") n.find("td.status").text(ok_symbol);
      if (r[i].type == "error") n.find("td.status").text(error_symbol);
      if (r[i].type == "warning") n.find("td.status").text(warning_symbol);
      count_by_status[r[i].type]++;

      n.find("td.message p").text(r[i].text);
      dom("#system-checks tbody").append(n);

      if (r[i].extra.length > 0) {
        n.find("a.showhide")
          .show()
          .text("show more")
          .click(function () {
            dom(this).hide();
            dom(this).parent().find(".extra").fadeIn();
            return false;
          });
      }

      for (var j = 0; j < r[i].extra.length; j++) {
        var m = dom("<div/>").text(r[i].extra[j].text);
        if (r[i].extra[j].monospace) m.addClass("pre");
        n.find("> td.message > div").append(m);
      }
    }

    // Summary counts
    summary.html("Summary: ");
    if (count_by_status["error"] + count_by_status["warning"] == 0) {
      summary.append(
        dom('<span class="summary-ok"/>').text(`All ${count_by_status["ok"]} ${ok_symbol} OK`),
      );
    } else {
      summary.append(
        dom('<span class="summary-ok"/>').text(`${count_by_status["ok"]} ${ok_symbol} OK, `),
      );
      summary.append(
        dom('<span class="summary-error"/>').text(
          `${count_by_status["error"]} ${error_symbol} Error, `,
        ),
      );
      summary.append(
        dom('<span class="summary-warning"/>').text(
          `${count_by_status["warning"]} ${warning_symbol} Warning`,
        ),
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
