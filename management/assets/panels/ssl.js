import { api } from "../api.js";
import { dom } from "../dom.js";
import { show_modal_error } from "../modal.js";
import { registerPanel } from "../state.js";

function show_tls(keep_provisioning_shown) {
  api("/ssl/status", "GET", {}, function (res) {
    // provisioning status

    if (!keep_provisioning_shown) dom("#ssl_provision").toggle(res.can_provision.length > 0);

    dom("#ssl_provision_p").toggle(res.can_provision.length > 0);
    if (res.can_provision.length > 0)
      dom("#ssl_provision_p span").text(res.can_provision.join(", "));

    // certificate status
    var domains = res.status;
    var tb = dom("#ssl_domains tbody");
    tb.text("");
    dom("#ssldomain").html('<option value="">(select)</option>');
    dom("#ssl_domains").show();
    for (var i = 0; i < domains.length; i++) {
      var row = dom(
        "<tr><th scope='row' class='domain'><a href=''></a></th><td class='status'></td> <td class='actions'><a href='#' class='btn btn-xs ssl-install'>Install Certificate</a></td></tr>",
      );
      tb.append(row);
      row.attr("data-domain", domains[i].domain);
      row.find(".domain a").text(domains[i].domain);
      row.find(".domain a").attr("href", "https://" + domains[i].domain);
      if (domains[i].status == "not-applicable") {
        domains[i].status = "muted"; // text-muted css class
        row.find(".actions a").remove(); // no actions applicable
      }
      row.addClass("text-" + domains[i].status);
      row.find(".status").text(domains[i].text);
      if (domains[i].status == "success") {
        row.find(".actions a").addClass("btn-default").text("Replace Certificate");
      } else {
        row.find(".actions a").addClass("btn-primary").text("Install Certificate");
      }

      dom("#ssldomain").append(dom("<option>").text(domains[i].domain));
    }
  });
}

function ssl_install(elem) {
  var domain = dom(elem).parents("tr").attr("data-domain");
  dom("#ssldomain").val(domain);
  show_csr();
  dom("html, body").animate({
    scrollTop: dom("#ssl_install_header").offset().top - dom(".navbar-fixed-top").height() - 20,
  });
  return false;
}

function show_csr() {
  // Can't show a CSR until both inputs are entered.
  if (dom("#ssldomain").val() == "") return;
  if (dom("#sslcc").val() == "") return;

  // Scroll to it and fetch.
  dom("#csr_info").slideDown();
  dom("#ssl_csr").text("Loading...");
  api(
    "/ssl/csr/" + dom("#ssldomain").val(),
    "POST",
    {
      countrycode: dom("#sslcc").val(),
    },
    function (data) {
      dom("#ssl_csr").text(data);
    },
  );
}

function install_cert() {
  api(
    "/ssl/install",
    "POST",
    {
      domain: dom("#ssldomain").val(),
      cert: dom("#ssl_paste_cert").val(),
      chain: dom("#ssl_paste_chain").val(),
    },
    function (status) {
      if (/^OK($|\n)/.test(status)) {
        console.log(status);
        show_modal_error(
          "TLS Certificate Installation",
          "Certificate has been installed. Check that you have no connection problems to the domain.",
          function () {
            show_tls();
            dom("#csr_info").slideUp();
          },
        );
      } else {
        show_modal_error("TLS Certificate Installation", status);
      }
    },
  );
}

function provision_tls_cert() {
  // Automatically provision any certs.
  dom("#ssl_provision_p .btn").attr("disabled", "1"); // prevent double-clicks
  api("/ssl/provision", "POST", {}, function (status) {
    // Clear last attempt.
    dom("#ssl_provision_result").text("");
    may_reenable_provision_button = true;

    // Nothing was done. There might also be problem domains, but we've already displayed those.
    if (status.requests.length == 0) {
      show_modal_error(
        "TLS Certificate Provisioning",
        "There were no domain names to provision certificates for.",
      );
      // don't return - haven't re-enabled the provision button
    }

    // Each provisioning API call returns zero or more "requests" which represent
    // a request to Let's Encrypt for a single certificate. Normally there is just
    // one request (for a single multi-domain certificate).
    for (var i = 0; i < status.requests.length; i++) {
      var r = status.requests[i];

      if (r.result == "skipped") {
        // not interested --- this domain wasn't in the table
        // to begin with
        continue;
      }

      // create an HTML block to display the results of this request
      var n = dom("<div><h4/><p/></div>");
      dom("#ssl_provision_result").append(n);

      // plain log line
      if (typeof r === "string") {
        n.find("p").text(r);
        continue;
      }

      // show a header only to disambiguate request blocks
      if (status.requests.length > 0) n.find("h4").text(r.domains.join(", "));

      if (r.result == "error") {
        n.find("p").addClass("text-danger").text(r.message);
      } else if (r.result == "installed") {
        n.find("p")
          .addClass("text-success")
          .text("The TLS certificate was provisioned and installed.");
        setTimeout(() => show_tls(true), 1); // update statuses without clearing provisioning output
      }

      // display the detailed log info in case of problems
      var trace = dom("<div class='small text-muted' style='margin-top: 1.5em'>Log:</div>");
      n.append(trace);
      for (var j = 0; j < r.log.length; j++) trace.append(dom("<div/>").text(r.log[j]));
    }

    if (may_reenable_provision_button) dom("#ssl_provision_p .btn").removeAttr("disabled");
  });
}

registerPanel("tls", show_tls);
document.querySelector("#panel_tls").addEventListener("click", (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;
  if (target.matches("[data-tls-action='provision']")) provision_tls_cert();
  else if (target.matches("[data-tls-action='install']")) install_cert();
  else if (target.matches(".ssl-install")) ssl_install(target);
  else return;
  event.preventDefault();
});
document
  .querySelectorAll("#ssldomain, #sslcc")
  .forEach((select) => select.addEventListener("change", show_csr));
