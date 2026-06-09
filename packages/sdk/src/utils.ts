/**
 * @file utils.ts
 * @description Generic helper routines like URL cleaners.
 * @why Prevents leaking sensitive credential tokens within paths.
 */


/**
 * Sanitizes a URL string by stripping query parameters and hash fragments.
 * Used to ensure PII (which often lives in query strings) is not leaked 
 * during navigation or network error tracking.
 * 
 * @param urlStr - The raw URL string to sanitize.
 * @returns The origin and pathname without query or hash strings.
 */
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
