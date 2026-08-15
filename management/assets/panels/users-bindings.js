import {
  do_add_user,
  generate_random_password,
  mod_priv,
  users_remove,
  users_set_password,
  users_set_quota,
} from "./users.js";

document.querySelector("#panel_users form").addEventListener("submit", (event) => {
  event.preventDefault();
  do_add_user();
});

document.querySelector("#panel_users").addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (!link) return;
  if (link.matches("[data-user-action='random-password']")) generate_random_password();
  else if (link.matches(".setquota")) users_set_quota(link);
  else if (link.matches(".setpw")) users_set_password(link);
  else if (link.matches(".if_active")) users_remove(link);
  else if (link.matches("[data-privilege-action]")) mod_priv(link, link.dataset.privilegeAction);
  else return;
  event.preventDefault();
});
