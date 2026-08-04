import { api } from "../api.js";
import { create_element, query } from "../elements.js";

function privilegeLink(action, privilege) {
  const name = create_element("span", { className: "name", textContent: privilege });
  const link = create_element(
    "a",
    {
      href: "#",
      title: `${action === "add" ? "Add" : "Remove"} Privilege`,
    },
    action === "add" ? ["make ", name] : ["remove privilege"],
  );
  link.dataset.privilegeAction = action;
  return action === "add"
    ? create_element("span", {}, [link, " | "])
    : create_element("span", {}, [create_element("b", {}, [name]), " (", link, ") |"]);
}

function userRows(user) {
  const row = query("#user-template").cloneNode(true);
  const extraRow = query("#user-extra-template").cloneNode(true);
  row.removeAttribute("id");
  extraRow.removeAttribute("id");
  row.classList.add("account_" + user.status);
  extraRow.classList.add("account_" + user.status);
  row.dataset.email = user.email;
  row.dataset.quota = user.quota;
  query(".address", row).textContent = user.email;
  query(".box-size", row).textContent = user.box_size;
  if (user.box_size === "?") query(".box-size", row).title = "Mailbox size is unknown";
  query(".percent", row).textContent = user.percent;
  query(".quota", row).textContent = user.quota === "0" ? "unlimited" : user.quota;
  query(".restore_info tt", extraRow).textContent = user.mailbox;

  if (user.status !== "inactive") {
    user.privileges.forEach((privilege) =>
      query(".privs", row).append(privilegeLink("remove", privilege)),
    );
    if (!user.privileges.includes("admin"))
      query(".add-privs", row).append(privilegeLink("add", "admin"));
  }
  return [row, extraRow];
}

export function show_users() {
  const tableBody = query("#user_table tbody");
  tableBody.replaceChildren(
    create_element("tr", {}, [
      create_element("td", { colSpan: 2, className: "text-muted", textContent: "Loading..." }),
    ]),
  );
  api("/mail/users", "GET", { format: "json" }, (domains) => {
    tableBody.replaceChildren();
    domains.forEach((domain) => {
      tableBody.append(
        create_element("tr", {}, [
          create_element("th", {
            role: "heading",
            ariaLevel: "4",
            colSpan: 6,
            style: "background-color: #EEE",
            textContent: domain.domain,
          }),
        ]),
      );
      domain.users.forEach((user) => tableBody.append(...userRows(user)));
    });
  });
}
