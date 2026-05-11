export function sanitizeUrl(urlStr: string): string {
  if (!urlStr) return "";
  try {
    const url = new URL(urlStr);
    return url.origin + url.pathname;
  } catch {
    // For malformed URLs or SSR, strip query parameters and hash fragments manually
    return urlStr.split("?")[0]!.split("#")[0]!;
  }
}
