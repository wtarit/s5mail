import { api } from "../api.js";
import { registerPanel } from "../state.js";

function show_munin() {
  // Set the cookie.
  api("/munin", "GET", {}, function () {
    // Redirect.
    window.open("/admin/munin/index.html", "_blank");
  });
}

registerPanel("munin", show_munin);
