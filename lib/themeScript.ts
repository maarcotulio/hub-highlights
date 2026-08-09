/**
 * Applies the saved theme before first paint, so a dark-mode user doesn't get
 * a white flash while React hydrates. Has to be inline and synchronous in
 * <head> for that to work.
 *
 * Kept in its own module because next.config.ts derives the CSP script hash
 * from this exact string — a copy in the layout would silently drift out of
 * sync with the header and break the page under an enforcing policy.
 */
export const THEME_BOOTSTRAP_SCRIPT = `
  try {
    var theme = localStorage.getItem("theme");
    if (theme) document.documentElement.dataset.theme = theme;
  } catch (e) {}
`;
