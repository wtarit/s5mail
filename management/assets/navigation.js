function closeDropdown(toggle) {
  toggle.parentElement.classList.remove("open");
  toggle.setAttribute("aria-expanded", "false");
}

function openDropdown(toggle) {
  document.querySelectorAll("[data-dropdown].open > [data-dropdown-toggle]").forEach(closeDropdown);
  toggle.parentElement.classList.add("open");
  toggle.setAttribute("aria-expanded", "true");
}

function closeDropdowns() {
  document.querySelectorAll("[data-dropdown].open > [data-dropdown-toggle]").forEach(closeDropdown);
}

export function initializeNavigation() {
  const collapse = document.querySelector(".navbar-collapse");
  const collapseToggle = document.querySelector("[data-collapse-toggle]");
  collapseToggle.setAttribute("aria-expanded", "false");
  collapseToggle.addEventListener("click", () => {
    const open = collapse.classList.toggle("in");
    collapseToggle.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll("[data-dropdown-toggle]").forEach((toggle) => {
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      if (toggle.parentElement.classList.contains("open")) closeDropdown(toggle);
      else openDropdown(toggle);
    });
    toggle.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      openDropdown(toggle);
      const links = [...toggle.parentElement.querySelectorAll(".dropdown-menu a")];
      links[event.key === "ArrowDown" ? 0 : links.length - 1]?.focus();
    });
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-dropdown]") || event.target.closest(".dropdown-menu a"))
      closeDropdowns();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll("[data-dropdown].open > [data-dropdown-toggle]").forEach((toggle) => {
      closeDropdown(toggle);
      toggle.focus();
    });
    if (collapse.classList.contains("in")) {
      collapse.classList.remove("in");
      collapseToggle.setAttribute("aria-expanded", "false");
      collapseToggle.focus();
    }
  });
}
