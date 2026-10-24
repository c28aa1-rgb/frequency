// The site is served from a sub-path on GitHub Pages (e.g. /frequency). Next's
// <Link> and router add it automatically; raw URLs (OAuth redirects, the
// service worker) need it added by hand.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function appUrl(path: string): string {
  return `${window.location.origin}${BASE_PATH}${path}`;
}
