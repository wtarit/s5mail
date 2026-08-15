import { api } from "../api.js";
import { create_element, preformatted, query, queryAll, setVisible } from "../elements.js";
import { show_modal_error } from "../modal.js";
import { registerPanel } from "../state.js";

function toggle_form() {
  var target_type = query("#backup-target-type").value;
  queryAll(
    ".backup-target-local, .backup-target-rsync, .backup-target-s3, .backup-target-b2",
  ).forEach((element) => setVisible(element, false));
  queryAll(".backup-target-" + target_type).forEach((element) => setVisible(element, true));

  init_inputs(target_type);
}

function nice_size(bytes) {
  var powers = ["bytes", "KB", "MB", "GB", "TB"];
  while (true) {
    if (powers.length == 1) break;
    if (bytes < 1000) break;
    bytes /= 1024;
    powers.shift();
  }
  // round to have three significant figures but at most one decimal place
  if (bytes >= 100) bytes = Math.round(bytes);
  else bytes = Math.round(bytes * 10) / 10;
  return bytes + " " + powers[0];
}

function show_system_backup() {
  show_custom_backup();

  const tableBody = query("#backup-status tbody");
  tableBody.replaceChildren(
    create_element("tr", {}, [
      create_element("td", { colSpan: 2, className: "text-muted", textContent: "Loading..." }),
    ]),
  );
  api("/system/backup/status", "GET", {}, function (r) {
    if (r.error) {
      show_modal_error("Backup Error", preformatted(r.error));
      return;
    }

    tableBody.replaceChildren();
    var total_disk_size = 0;

    if (typeof r.backups == "undefined") {
      tableBody.append(
        create_element("tr", {}, [
          create_element("td", { colSpan: 3, textContent: "Backups are turned off." }),
        ]),
      );
      return;
    } else if (r.backups.length == 0) {
      tableBody.append(
        create_element("tr", {}, [
          create_element("td", { colSpan: 3, textContent: "No backups have been made yet." }),
        ]),
      );
    }

    for (var i = 0; i < r.backups.length; i++) {
      var b = r.backups[i];
      const row = create_element("tr");
      if (b.full) row.classList.add("full-backup");
      row.append(
        create_element("td", { textContent: b.date_str }),
        create_element("td", { textContent: b.date_delta + " ago" }),
        create_element("td", { textContent: b.full ? "full" : "increment" }),
        create_element("td", { style: "text-align: right", textContent: nice_size(b.size) }),
        b.deleted_in
          ? create_element("td", { textContent: b.deleted_in })
          : create_element("td", { className: "text-muted", textContent: "unknown" }),
      );
      tableBody.append(row);

      total_disk_size += b.size;
    }

    total_disk_size += r.unmatched_file_size;
    query("#backup-total-size").textContent = nice_size(total_disk_size);
  });
}

function show_custom_backup() {
  queryAll(
    ".backup-target-local, .backup-target-rsync, .backup-target-s3, .backup-target-b2",
  ).forEach((element) => setVisible(element, false));
  api("/system/backup/config", "GET", {}, function (r) {
    query("#backup-target-user").value = r.target_user;
    query("#backup-target-pass").value = r.target_pass;
    query("#min-age").value = r.min_age_in_days;
    queryAll(".backup-location").forEach(
      (element) => (element.textContent = r.file_target_directory),
    );
    queryAll(".backup-encpassword-file").forEach(
      (element) => (element.textContent = r.enc_pw_file),
    );
    query("#ssh-pub-key").value = r.ssh_pub_key;

    if (r.target == "file://" + r.file_target_directory) {
      query("#backup-target-type").value = "local";
    } else if (r.target == "off") {
      query("#backup-target-type").value = "off";
    } else if (r.target.substring(0, 8) == "rsync://") {
      const spec = url_split(r.target);
      query("#backup-target-type").value = spec.scheme;
      query("#backup-target-rsync-user").value = spec.user;
      query("#backup-target-rsync-host").value = spec.host;
      query("#backup-target-rsync-path").value = spec.path;
    } else if (r.target.substring(0, 5) == "s3://") {
      const spec = url_split(r.target);
      query("#backup-target-type").value = "s3";
      query("#backup-target-s3-host-select").value = spec.host;
      query("#backup-target-s3-host").value = spec.host;
      query("#backup-target-s3-region-name").value = spec.user; // stuffing the region name in the username
      query("#backup-target-s3-path").value = spec.path;
    } else if (r.target.substring(0, 5) == "b2://") {
      query("#backup-target-type").value = "b2";
      var targetPath = r.target.substring(5);
      var b2_application_keyid = targetPath.split(":")[0];
      var b2_applicationkey = targetPath.split(":")[1].split("@")[0];
      var b2_bucket = targetPath.split("@")[1];
      query("#backup-target-b2-user").value = b2_application_keyid;
      query("#backup-target-b2-pass").value = decodeURIComponent(b2_applicationkey);
      query("#backup-target-b2-bucket").value = b2_bucket;
    }
    toggle_form();
  });
}

function set_custom_backup() {
  var target_type = query("#backup-target-type").value;
  var target_user = query("#backup-target-user").value;
  var target_pass = query("#backup-target-pass").value;

  var target;
  if (target_type == "local" || target_type == "off") target = target_type;
  else if (target_type == "s3")
    target =
      "s3://" +
      (query("#backup-target-s3-region-name").value
        ? query("#backup-target-s3-region-name").value + "@"
        : "") +
      query("#backup-target-s3-host").value +
      "/" +
      query("#backup-target-s3-path").value;
  else if (target_type == "rsync") {
    target =
      "rsync://" +
      query("#backup-target-rsync-user").value +
      "@" +
      query("#backup-target-rsync-host").value +
      "/" +
      query("#backup-target-rsync-path").value;
    target_user = "";
  } else if (target_type == "b2") {
    target =
      "b2://" +
      query("#backup-target-b2-user").value +
      ":" +
      encodeURIComponent(query("#backup-target-b2-pass").value) +
      "@" +
      query("#backup-target-b2-bucket").value;
    target_user = "";
    target_pass = "";
  }

  var min_age = query("#min-age").value;
  api(
    "/system/backup/config",
    "POST",
    {
      target: target,
      target_user: target_user,
      target_pass: target_pass,
      min_age: min_age,
    },
    function (r) {
      // use .text() --- it's a text response, not html
      show_modal_error("Backup configuration", r, function () {
        if (r == "OK") show_system_backup();
      }); // refresh after modal on success
    },
    function (r) {
      // use .text() --- it's a text response, not html
      show_modal_error("Backup configuration", r);
    },
  );
  return false;
}

function init_inputs(target_type) {
  function set_host(host) {
    if (host !== "other") {
      query("#backup-target-s3-host").value = host;
    } else {
      query("#backup-target-s3-host").value = "";
    }
  }
  if (target_type == "s3") {
    const hostSelect = query("#backup-target-s3-host-select");
    hostSelect.onchange = () => set_host(hostSelect.value);
    set_host(hostSelect.value);
  }
}

// Return a two-element array of the substring preceding and the substring following
// the first occurrence of separator in string. Return [undefined, string] if the
// separator does not appear in string.
const split1_rest = (string, separator) => {
  const index = string.indexOf(separator);
  return index >= 0
    ? [string.substring(0, index), string.substring(index + separator.length)]
    : [undefined, string];
};

// Note: The manifest JS URL class does not work in some security-conscious
// settings, e.g. Brave browser, so we roll our own that handles only what we need.
//
// Use greedy separator parsing to get parts of an S5 Mail backup target URL.
// Note: path will not include a leading forward slash '/'
const url_split = (url) => {
  const [scheme, scheme_rest] = split1_rest(url, "://");
  const [user, user_rest] = split1_rest(scheme_rest, "@");
  const [host, path] = split1_rest(user_rest, "/");

  return {
    scheme,
    user,
    host,
    path,
  };
};

// Hide Copy button if not in a modern clipboard-supporting environment.
if (!(navigator && navigator.clipboard && navigator.clipboard.writeText)) {
  document.getElementById("copy_pub_key_div").hidden = true;
}

function copy_pub_key_to_clipboard() {
  const ssh_pub_key = query("#ssh-pub-key").value;
  navigator.clipboard.writeText(ssh_pub_key);
}

registerPanel("system_backup", show_system_backup);
document.querySelector("#panel_system_backup form").addEventListener("submit", (event) => {
  event.preventDefault();
  set_custom_backup();
});
document.querySelector("#backup-target-type").addEventListener("change", toggle_form);
document
  .querySelector("[data-backup-action='copy']")
  .addEventListener("click", copy_pub_key_to_clipboard);
