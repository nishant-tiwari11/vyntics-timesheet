// Whether an admin's menu is along the top (true) or in the sidebar. Kept in the same cookie the sidebar fold uses, and
// mirrored on the page's shell element so it switches at once, with no reload.
export function setAdminTopNav(on: boolean) {
  document.cookie = `ts-side=${on ? "collapsed" : "open"}; path=/; max-age=31536000; SameSite=Lax`;
  document.querySelector(".ts-shell")?.setAttribute("data-topnav", String(on));
}
