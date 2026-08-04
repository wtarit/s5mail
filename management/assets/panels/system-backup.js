import { api } from "../api.js";
import { dom } from "../dom.js";
import { show_modal_error } from "../modal.js";
import { registerPanel } from "../state.js";

function toggle_form() {
  var target_type = dom("#backup-target-type").val();
  dom(".backup-target-local, .backup-target-rsync, .backup-target-s3, .backup-target-b2").hide();
  dom(".backup-target-" + target_type).show();

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

  dom("#backup-status tbody").html("<tr><td colspan='2' class='text-muted'>Loading...</td></tr>");
  api("/system/backup/status", "GET", {}, function (r) {
    if (r.error) {
      show_modal_error("Backup Error", dom("<pre/>").text(r.error).get(0));
      return;
    }

    dom("#backup-status tbody").html("");
    var total_disk_size = 0;

    if (typeof r.backups == "undefined") {
      var tr = dom('<tr><td colspan="3">Backups are turned off.</td></tr>');
      dom("#backup-status tbody").append(tr);
      return;
    } else if (r.backups.length == 0) {
      var tr = dom('<tr><td colspan="3">No backups have been made yet.</td></tr>');
      dom("#backup-status tbody").append(tr);
    }

    for (var i = 0; i < r.backups.length; i++) {
      var b = r.backups[i];
      var tr = dom("<tr/>");
      if (b.full) tr.addClass("full-backup");
      tr.append(dom("<td/>").text(b.date_str));
      tr.append(dom("<td/>").text(b.date_delta + " ago"));
      tr.append(dom("<td/>").text(b.full ? "full" : "increment"));
      tr.append(dom('<td style="text-align: right"/>').text(nice_size(b.size)));
      if (b.deleted_in) tr.append(dom("<td/>").text(b.deleted_in));
      else tr.append(dom('<td class="text-muted">unknown</td>'));
      dom("#backup-status tbody").append(tr);

      total_disk_size += b.size;
    }

    total_disk_size += r.unmatched_file_size;
    dom("#backup-total-size").text(nice_size(total_disk_size));
  });
}

function show_custom_backup() {
  dom(".backup-target-local, .backup-target-rsync, .backup-target-s3, .backup-target-b2").hide();
  api("/system/backup/config", "GET", {}, function (r) {
    dom("#backup-target-user").val(r.target_user);
    dom("#backup-target-pass").val(r.target_pass);
    dom("#min-age").val(r.min_age_in_days);
    dom(".backup-location").text(r.file_target_directory);
    dom(".backup-encpassword-file").text(r.enc_pw_file);
    dom("#ssh-pub-key").val(r.ssh_pub_key);

    if (r.target == "file://" + r.file_target_directory) {
      dom("#backup-target-type").val("local");
    } else if (r.target == "off") {
      dom("#backup-target-type").val("off");
    } else if (r.target.substring(0, 8) == "rsync://") {
      const spec = url_split(r.target);
      dom("#backup-target-type").val(spec.scheme);
      dom("#backup-target-rsync-user").val(spec.user);
      dom("#backup-target-rsync-host").val(spec.host);
      dom("#backup-target-rsync-path").val(spec.path);
    } else if (r.target.substring(0, 5) == "s3://") {
      const spec = url_split(r.target);
      dom("#backup-target-type").val("s3");
      dom("#backup-target-s3-host-select").val(spec.host);
      dom("#backup-target-s3-host").val(spec.host);
      dom("#backup-target-s3-region-name").val(spec.user); // stuffing the region name in the username
      dom("#backup-target-s3-path").val(spec.path);
    } else if (r.target.substring(0, 5) == "b2://") {
      dom("#backup-target-type").val("b2");
      var targetPath = r.target.substring(5);
      var b2_application_keyid = targetPath.split(":")[0];
      var b2_applicationkey = targetPath.split(":")[1].split("@")[0];
      var b2_bucket = targetPath.split("@")[1];
      dom("#backup-target-b2-user").val(b2_application_keyid);
      dom("#backup-target-b2-pass").val(decodeURIComponent(b2_applicationkey));
      dom("#backup-target-b2-bucket").val(b2_bucket);
    }
    toggle_form();
  });
}

function set_custom_backup() {
  var target_type = dom("#backup-target-type").val();
  var target_user = dom("#backup-target-user").val();
  var target_pass = dom("#backup-target-pass").val();

  var target;
  if (target_type == "local" || target_type == "off") target = target_type;
  else if (target_type == "s3")
    target =
      "s3://" +
      (dom("#backup-target-s3-region-name").val()
        ? dom("#backup-target-s3-region-name").val() + "@"
        : "") +
      dom("#backup-target-s3-host").val() +
      "/" +
      dom("#backup-target-s3-path").val();
  else if (target_type == "rsync") {
    target =
      "rsync://" +
      dom("#backup-target-rsync-user").val() +
      "@" +
      dom("#backup-target-rsync-host").val() +
      "/" +
      dom("#backup-target-rsync-path").val();
    target_user = "";
  } else if (target_type == "b2") {
    target =
      "b2://" +
      dom("#backup-target-b2-user").val() +
      ":" +
      encodeURIComponent(dom("#backup-target-b2-pass").val()) +
      "@" +
      dom("#backup-target-b2-bucket").val();
    target_user = "";
    target_pass = "";
  }

  var min_age = dom("#min-age").val();
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
      show_modal_error("Backup configuration", dom("<p/>").text(r).get(0), function () {
        if (r == "OK") show_system_backup();
      }); // refresh after modal on success
    },
    function (r) {
      // use .text() --- it's a text response, not html
      show_modal_error("Backup configuration", dom("<p/>").text(r).get(0));
    },
  );
  return false;
}

function init_inputs(target_type) {
  function set_host(host) {
    if (host !== "other") {
      dom("#backup-target-s3-host").val(host);
    } else {
      dom("#backup-target-s3-host").val("");
    }
  }
  if (target_type == "s3") {
    dom("#backup-target-s3-host-select")
      .off("change")
      .on("change", function () {
        set_host(dom("#backup-target-s3-host-select").val());
      });
    set_host(dom("#backup-target-s3-host-select").val());
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
// Use greedy separator parsing to get parts of a MIAB backup target url.
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
  const ssh_pub_key = dom("#ssh-pub-key").val();
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
