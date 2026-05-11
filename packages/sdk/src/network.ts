import { sanitizeUrl } from "./utils";
import type { SummaryEvent, NetworkFailureEvent } from "./types";

export interface NetworkCaptureContext {
  summaryEvents: SummaryEvent[];
  endpoint: string;
}

// Track whether we are globally patched to prevent double-patching
let isGlobalFetchPatched = false;
let isGlobalXhrPatched = false;

// Rate limiting & deduplication
const MAX_ERRORS_PER_PAGE = 50;
let errorCount = 0;

const RECENT_ERRORS_CACHE_MS = 2000;
const recentErrors = new Set<string>();

function shouldReport(method: string, url: string, status: number, source: string, ctx: NetworkCaptureContext): boolean {
  if (errorCount >= MAX_ERRORS_PER_PAGE) return false;
  
  // Ignore SDK ingestion requests to prevent recursive telemetry loops
  if (url.includes(ctx.endpoint)) return false;

  const fingerprint = `${method}:${url}:${status}:${source}`;
  if (recentErrors.has(fingerprint)) return false;
  
  recentErrors.add(fingerprint);
  setTimeout(() => recentErrors.delete(fingerprint), RECENT_ERRORS_CACHE_MS);
  
  return true;
}

export function setupNetworkCapture(ctx: NetworkCaptureContext): () => void {
  if (typeof window === "undefined") return () => {};

  let isReporting = false;
  let isActive = true;

  // Local references for chain safety
  let localOriginalFetch: typeof window.fetch | undefined;
  let localVigilFetch: typeof window.fetch | undefined;
  let localOriginalXhrOpen: typeof XMLHttpRequest.prototype.open | undefined;
  let localOriginalXhrSend: typeof XMLHttpRequest.prototype.send | undefined;
  let localVigilXhrOpen: typeof XMLHttpRequest.prototype.open | undefined;
  let localVigilXhrSend: typeof XMLHttpRequest.prototype.send | undefined;

  // Patch fetch
  if (window.fetch && !isGlobalFetchPatched) {
    isGlobalFetchPatched = true;
    localOriginalFetch = window.fetch;
    localVigilFetch = function (this: any, input: RequestInfo | URL, init?: RequestInit) {
      const startTime = Date.now();
      
      // Preserve exact native fetch behavior and return original promise
      const promise = localOriginalFetch!.apply(this, [input, init] as any);
      
      promise.then(
        (response) => {
          if (!isActive) return;
          if (response && response.status >= 400 && !isReporting) {
            isReporting = true;
            try {
              let method = "GET";
              let url = "";
              
              if (typeof input === "string") {
                url = input;
              } else if (input instanceof URL) {
                url = input.href;
              } else if (typeof Request !== "undefined" && input instanceof Request) {
                url = input.url;
                method = input.method;
              }

              if (init && init.method) {
                method = init.method;
              }

              method = String(method).toUpperCase();
              const sanitizedUrl = sanitizeUrl(url).substring(0, 500);

              if (shouldReport(method, sanitizedUrl, response.status, "fetch", ctx)) {
                errorCount++;
                ctx.summaryEvents.push({
                  type: "network_failure",
                  method,
                  url: sanitizedUrl,
                  status: response.status,
                  statusText: response.statusText ? String(response.statusText).substring(0, 100) : undefined,
                  durationMs: Date.now() - startTime,
                  source: "fetch",
                  timestampMs: Date.now(),
                } as NetworkFailureEvent);
              }
            } catch (e) {
              // Ignore normalization/enqueueing errors
            } finally {
              isReporting = false;
            }
          }
        },
        () => {
          // Rejections (e.g. DNS failure, CORS, offline) are ignored per 4xx/5xx requirement
        }
      );
      
      return promise;
    };
    window.fetch = localVigilFetch;
  }

  // Patch XHR
  if (typeof XMLHttpRequest !== "undefined" && !isGlobalXhrPatched) {
    isGlobalXhrPatched = true;
    localOriginalXhrOpen = XMLHttpRequest.prototype.open;
    localOriginalXhrSend = XMLHttpRequest.prototype.send;

    localVigilXhrOpen = function (this: XMLHttpRequest, method: string, url: string | URL, ...args: any[]) {
      try {
        (this as any).__vigilData = {
          method: String(method).toUpperCase(),
          url: typeof url === "string" ? url : url.href,
        };
      } catch (e) {
        // Ignore
      }
      return localOriginalXhrOpen!.apply(this, [method, url, ...args] as any);
    };

    localVigilXhrSend = function (this: XMLHttpRequest, ...args: any[]) {
      const startTime = Date.now();
      const vigilData = (this as any).__vigilData;

      if (vigilData) {
        const onReadyStateChange = () => {
          if (this.readyState === 4) { // DONE
            try {
              if (this.removeEventListener) {
                this.removeEventListener("readystatechange", onReadyStateChange);
              }
            } catch (e) {}

            if (!isActive) return;

            if (this.status >= 400 && !isReporting) {
              isReporting = true;
              try {
                const sanitizedUrl = sanitizeUrl(vigilData.url).substring(0, 500);
                if (shouldReport(vigilData.method, sanitizedUrl, this.status, "xhr", ctx)) {
                  errorCount++;
                  ctx.summaryEvents.push({
                    type: "network_failure",
                    method: vigilData.method,
                    url: sanitizedUrl,
                    status: this.status,
                    statusText: this.statusText ? String(this.statusText).substring(0, 100) : undefined,
                    durationMs: Date.now() - startTime,
                    source: "xhr",
                    timestampMs: Date.now(),
                  } as NetworkFailureEvent);
                }
              } catch (e) {
                // Ignore
              } finally {
                isReporting = false;
              }
            }
          }
        };

        try {
          if (this.addEventListener) {
            this.addEventListener("readystatechange", onReadyStateChange);
          } else {
            // Fallback for extreme legacy
            const originalOnReadyStateChange = this.onreadystatechange;
            this.onreadystatechange = function (ev: Event) {
              onReadyStateChange();
              if (originalOnReadyStateChange) originalOnReadyStateChange.apply(this, [ev]);
            };
          }
        } catch (e) {
          // Ignore attachment errors
        }
      }

      return localOriginalXhrSend!.apply(this, args as any);
    };

    XMLHttpRequest.prototype.open = localVigilXhrOpen;
    XMLHttpRequest.prototype.send = localVigilXhrSend;
  }

  return function teardown() {
    if (typeof window === "undefined") return;
    isActive = false;

    if (localVigilFetch && window.fetch === localVigilFetch && localOriginalFetch) {
      window.fetch = localOriginalFetch;
      isGlobalFetchPatched = false;
    }

    if (typeof XMLHttpRequest !== "undefined" && localVigilXhrOpen && localVigilXhrSend) {
      if (XMLHttpRequest.prototype.open === localVigilXhrOpen && localOriginalXhrOpen) {
        XMLHttpRequest.prototype.open = localOriginalXhrOpen;
        isGlobalXhrPatched = false; // Only clear if we actually unpatched it, wait, we unpatch open/send together.
      }
      if (XMLHttpRequest.prototype.send === localVigilXhrSend && localOriginalXhrSend) {
        XMLHttpRequest.prototype.send = localOriginalXhrSend;
        isGlobalXhrPatched = false;
      }
    }
  };
}
