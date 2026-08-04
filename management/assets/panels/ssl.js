import { api } from "../api.js";
import { create_element, query, setVisible } from "../elements.js";
import { show_modal_error } from "../modal.js";
import { registerPanel } from "../state.js";

function show_tls(keep_provisioning_shown) {
  api("/ssl/status", "GET", {}, function (res) {
    // provisioning status

    if (!keep_provisioning_shown) setVisible(query("#ssl_provision"), res.can_provision.length > 0);

    setVisible(query("#ssl_provision_p"), res.can_provision.length > 0);
    if (res.can_provision.length > 0)
      query("#ssl_provision_p span").textContent = res.can_provision.join(", ");

    // certificate status
    var domains = res.status;
    const tableBody = query("#ssl_domains tbody");
    tableBody.replaceChildren();
    const domainSelect = query("#ssldomain");
    domainSelect.replaceChildren(create_element("option", { value: "", textContent: "(select)" }));
    setVisible(query("#ssl_domains"), true);
    for (var i = 0; i < domains.length; i++) {
      const domainLink = create_element("a", {
        href: "https://" + domains[i].domain,
        textContent: domains[i].domain,
      });
      const action = create_element("a", {
        href: "#",
        className: "btn btn-xs ssl-install",
        textContent: "Install Certificate",
      });
      const row = create_element("tr", {}, [
        create_element("th", { scope: "row", className: "domain" }, [domainLink]),
        create_element("td", { className: "status" }),
        create_element("td", { className: "actions" }, [action]),
      ]);
      tableBody.append(row);
      row.dataset.domain = domains[i].domain;
      if (domains[i].status == "not-applicable") {
        domains[i].status = "muted"; // text-muted css class
        action.remove(); // no actions applicable
      }
      row.classList.add("text-" + domains[i].status);
      query(".status", row).textContent = domains[i].text;
      if (domains[i].status == "success") {
        action.classList.add("btn-default");
        action.textContent = "Replace Certificate";
      } else {
        action.classList.add("btn-primary");
        action.textContent = "Install Certificate";
      }

      domainSelect.append(create_element("option", { textContent: domains[i].domain }));
    }
  });
}

function ssl_install(elem) {
  var domain = elem.closest("tr").dataset.domain;
  query("#ssldomain").value = domain;
  show_csr();
  const header = query("#ssl_install_header");
  const navbarHeight = query(".navbar-fixed-top")?.getBoundingClientRect().height || 0;
  window.scrollTo({
    top: header.getBoundingClientRect().top + window.scrollY - navbarHeight - 20,
  });
  return false;
}

function show_csr() {
  // Can't show a CSR until both inputs are entered.
  if (query("#ssldomain").value === "") return;
  if (query("#sslcc").value === "") return;

  // Scroll to it and fetch.
  setVisible(query("#csr_info"), true);
  query("#ssl_csr").textContent = "Loading...";
  api(
    "/ssl/csr/" + query("#ssldomain").value,
    "POST",
    {
      countrycode: query("#sslcc").value,
    },
    function (data) {
      query("#ssl_csr").textContent = data;
    },
  );
}

function install_cert() {
  api(
    "/ssl/install",
    "POST",
    {
      domain: query("#ssldomain").value,
      cert: query("#ssl_paste_cert").value,
      chain: query("#ssl_paste_chain").value,
    },
    function (status) {
      if (/^OK($|\n)/.test(status)) {
        console.log(status);
        show_modal_error(
          "TLS Certificate Installation",
          "Certificate has been installed. Check that you have no connection problems to the domain.",
          function () {
            show_tls();
            setVisible(query("#csr_info"), false);
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
  query("#ssl_provision_p .btn").disabled = true; // prevent double-clicks
  api("/ssl/provision", "POST", {}, function (status) {
    // Clear last attempt.
    const result = query("#ssl_provision_result");
    result.replaceChildren();

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
      const heading = create_element("h4");
      const message = create_element("p");
      const block = create_element("div", {}, [heading, message]);
      result.append(block);

      // plain log line
      if (typeof r === "string") {
        message.textContent = r;
        continue;
      }

      // show a header only to disambiguate request blocks
      if (status.requests.length > 0) heading.textContent = r.domains.join(", ");

      if (r.result == "error") {
        message.classList.add("text-danger");
        message.textContent = r.message;
      } else if (r.result == "installed") {
        message.classList.add("text-success");
        message.textContent = "The TLS certificate was provisioned and installed.";
        setTimeout(() => show_tls(true), 1); // update statuses without clearing provisioning output
      }

      // display the detailed log info in case of problems
      const trace = create_element("div", {
        className: "small text-muted",
        style: "margin-top: 1.5em",
        textContent: "Log:",
      });
      block.append(trace);
      for (var j = 0; j < r.log.length; j++)
        trace.append(create_element("div", { textContent: r.log[j] }));
    }

    query("#ssl_provision_p .btn").disabled = false;
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
