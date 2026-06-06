export type Severity = "P0" | "P1" | "P2" | "P3"
export type IssueStatus = "open" | "linked" | "ignored" | "resolved"
export type Environment = "production" | "preview" | "development"

export interface IssueGroup {
  id: string
  title: string
  root_cause: string
  suggested_fix: string
  severity: Severity
  status: IssueStatus
  confidence: number
  affected_session_count: number
  first_seen_at: number
  last_seen_at: number
  github_issue_url: string | null
  github_issue_number: number | null
  github_auto_raised: boolean
  reproduction_steps: string[]
  evidence: Array<{ type: string; timestamp_ms: number; detail: string }>
}

export interface Session {
  id: string
  url: string
  user_agent: string
  screen_width: number
  screen_height: number
  release: string
  commit_sha: string
  environment: Environment
  duration_ms: number
  started_at: number
  has_js_error: boolean
  has_rage_click: boolean
  has_network_err: boolean
  has_dead_click: boolean
  error_count: number
  issue_instance_count: number
  ai_session_summary: string
  ai_goal_completed: boolean
  ai_friction_score: number
  ai_triage_confidence: number
  timeline: Array<{
    type: string
    timestamp_ms: number
    target?: string
    error_message?: string
    error_stack?: string
    network_url?: string
    network_status?: number
    network_method?: string
    click_count?: number
    nav_to?: string
  }>
}

export const mockIssues: IssueGroup[] = [
  {
    id: "igr_pay500",
    title: "TypeError: Cannot read properties of undefined (reading 'id') in payment handler",
    root_cause: "The 'cart.items' array is undefined when the user navigates directly to /checkout without going through the cart page. The payment handler assumes cart state is always populated.",
    suggested_fix: "Add a null-check guard on cart.items before accessing .id. Redirect to /cart if cart state is missing on /checkout mount. Consider persisting cart state to sessionStorage.",
    severity: "P0",
    status: "open",
    confidence: 0.97,
    affected_session_count: 34,
    first_seen_at: Date.now() - 1000 * 60 * 60 * 8,
    last_seen_at: Date.now() - 1000 * 60 * 62,
    github_issue_url: "https://github.com/acme/checkout-app/issues/147",
    github_issue_number: 147,
    github_auto_raised: false,
    reproduction_steps: [
      "Open /checkout directly (without visiting /cart first)",
      "Observe TypeError thrown in payment handler",
      "Cart items array is undefined — no guard exists",
      "Page renders broken state with no recovery path",
    ],
    evidence: [
      { type: "navigation",   timestamp_ms: 0,      detail: "Navigated directly to /checkout" },
      { type: "js_error",     timestamp_ms: 1240,   detail: "TypeError: Cannot read properties of undefined (reading 'id')" },
      { type: "rage_click",   timestamp_ms: 3800,   detail: "User clicked #pay-btn 5 times" },
    ],
  },
  {
    id: "igr_authlp",
    title: "POST /api/payment intermittently returns 503 during peak hours",
    root_cause: "The payment microservice is rate-limited at the infrastructure level. Under high load, requests queue and time out, returning 503 to the client with no retry logic in place.",
    suggested_fix: "Implement exponential backoff retry (max 3 attempts) on the payment fetch call. Surface a recoverable error message. Add circuit breaker monitoring to the payment service.",
    severity: "P1",
    status: "linked",
    confidence: 0.93,
    affected_session_count: 22,
    first_seen_at: Date.now() - 1000 * 60 * 60 * 12,
    last_seen_at: Date.now() - 1000 * 60 * 60 * 2,
    github_issue_url: "https://github.com/acme/checkout-app/issues/139",
    github_issue_number: 139,
    github_auto_raised: true,
    reproduction_steps: [
      "Attempt checkout during peak traffic window (12pm–2pm UTC)",
      "Click pay button",
      "POST /api/payment returns 503 after ~8 second timeout",
      "No user-facing error or retry option shown",
    ],
    evidence: [
      { type: "click",          timestamp_ms: 5400,   detail: "Clicked #pay-btn" },
      { type: "network_error",  timestamp_ms: 13400,  detail: "POST /api/payment → 503 (8s timeout)" },
      { type: "rage_click",     timestamp_ms: 13500,  detail: "User clicked #pay-btn 3 times" },
    ],
  },
  {
    id: "igr_sessex",
    title: "Silent session expiry causes auth loop on /dashboard without user notification",
    root_cause: "The JWT refresh token silently expires after 24h. The API returns 401 but the client catches the error and redirects to /login without clearing local state, causing an infinite redirect loop.",
    suggested_fix: "Intercept 401 responses globally in the API client. Clear auth state and local storage before redirecting. Show a toast: 'Your session expired — please sign in again.'",
    severity: "P1",
    status: "open",
    confidence: 0.91,
    affected_session_count: 18,
    first_seen_at: Date.now() - 1000 * 60 * 60 * 24,
    last_seen_at: Date.now() - 1000 * 60 * 60 * 3,
    github_issue_url: null,
    github_issue_number: null,
    github_auto_raised: false,
    reproduction_steps: [
      "Let session token expire (24h after login)",
      "Navigate to /dashboard",
      "API returns 401 on data fetch",
      "Client redirects to /login without clearing state",
      "Redirect loop begins — user cannot recover without clearing cookies",
    ],
    evidence: [
      { type: "navigation",   timestamp_ms: 0,     detail: "Navigated to /dashboard" },
      { type: "network_error",timestamp_ms: 820,   detail: "GET /api/user → 401 Unauthorized" },
      { type: "navigation",   timestamp_ms: 850,   detail: "Redirected to /login" },
      { type: "navigation",   timestamp_ms: 1100,  detail: "Redirected back to /dashboard (loop)" },
    ],
  },
  {
    id: "igr_promo",
    title: "Promo code field unresponsive after first failed attempt — triggers rage clicks",
    root_cause: "After a failed promo code submission, the input is disabled but the disabled state is not visually indicated. Users repeatedly click the non-functional button.",
    suggested_fix: "Add visible disabled styling to the promo input after a failed attempt. Show an inline error message. Re-enable the field after 3 seconds or on input change.",
    severity: "P1",
    status: "open",
    confidence: 0.88,
    affected_session_count: 9,
    first_seen_at: Date.now() - 1000 * 60 * 60 * 18,
    last_seen_at: Date.now() - 1000 * 60 * 60 * 5,
    github_issue_url: null,
    github_issue_number: null,
    github_auto_raised: false,
    reproduction_steps: [
      "Enter an invalid promo code",
      "Click Apply",
      "Input becomes disabled — no visual feedback",
      "User clicks Apply 4+ more times (rage click)",
    ],
    evidence: [
      { type: "click",      timestamp_ms: 4200,  detail: "Clicked #promo-apply-btn" },
      { type: "network_error", timestamp_ms: 4350, detail: "POST /api/promo → 422 Unprocessable" },
      { type: "rage_click", timestamp_ms: 5800,  detail: "Rage clicked #promo-apply-btn ×4" },
    ],
  },
  {
    id: "igr_postcd",
    title: "Address form accepts invalid postcodes and fails silently at order confirmation",
    root_cause: "Client-side postcode validation regex does not cover all UK postcode formats. Invalid values pass the form but are rejected by the shipping API, which returns a 422. The error is swallowed.",
    suggested_fix: "Replace the postcode regex with a comprehensive UK postcode validator library. Handle 422 responses from the shipping API and map them to user-facing field errors.",
    severity: "P2",
    status: "linked",
    confidence: 0.84,
    affected_session_count: 12,
    first_seen_at: Date.now() - 1000 * 60 * 60 * 30,
    last_seen_at: Date.now() - 1000 * 60 * 60 * 6,
    github_issue_url: "https://github.com/acme/checkout-app/issues/152",
    github_issue_number: 152,
    github_auto_raised: false,
    reproduction_steps: [
      "Enter a valid-looking but non-standard UK postcode (e.g. 'SW1A1AA' without space)",
      "Form passes client-side validation",
      "Submit to shipping API — returns 422",
      "UI shows generic 'Something went wrong' with no field indication",
    ],
    evidence: [
      { type: "click",         timestamp_ms: 8200,  detail: "Clicked #place-order-btn" },
      { type: "network_error", timestamp_ms: 8450,  detail: "POST /api/shipping → 422 Unprocessable" },
    ],
  },
  {
    id: "igr_mobnav",
    title: "Mobile navigation menu does not close after route change",
    root_cause: "The mobile hamburger menu state is not reset on router navigation events. After clicking a nav link, the overlay remains open.",
    suggested_fix: "Subscribe to Next.js router events (or usePathname) and call setMenuOpen(false) on route change.",
    severity: "P2",
    status: "open",
    confidence: 0.79,
    affected_session_count: 7,
    first_seen_at: Date.now() - 1000 * 60 * 60 * 48,
    last_seen_at: Date.now() - 1000 * 60 * 60 * 8,
    github_issue_url: null,
    github_issue_number: null,
    github_auto_raised: false,
    reproduction_steps: [
      "Open the app on mobile viewport",
      "Open the hamburger menu",
      "Click a nav link",
      "Observe overlay remains open after navigation",
    ],
    evidence: [
      { type: "click",      timestamp_ms: 1200,  detail: "Clicked #hamburger-btn" },
      { type: "click",      timestamp_ms: 2400,  detail: "Clicked nav link to /products" },
      { type: "navigation", timestamp_ms: 2420,  detail: "Navigated to /products" },
      { type: "dead_click", timestamp_ms: 3100,  detail: "Dead click on overlay backdrop" },
    ],
  },
  {
    id: "igr_lcp",
    title: "Hero image on /home loads without priority hint — LCP degraded on slow connections",
    root_cause: "The hero <img> tag lacks 'fetchpriority=high' and is not preloaded. On 3G, LCP exceeds 4s.",
    suggested_fix: "Add fetchpriority='high' to the hero image. Add a <link rel='preload'> in the document <head>. Use Next.js Image component with priority={true}.",
    severity: "P3",
    status: "open",
    confidence: 0.68,
    affected_session_count: 5,
    first_seen_at: Date.now() - 1000 * 60 * 60 * 72,
    last_seen_at: Date.now() - 1000 * 60 * 60 * 12,
    github_issue_url: null,
    github_issue_number: null,
    github_auto_raised: false,
    reproduction_steps: [
      "Load /home on a throttled 3G connection",
      "Observe hero image loads last",
      "LCP metric exceeds 4 seconds",
    ],
    evidence: [
      { type: "navigation", timestamp_ms: 0,    detail: "Navigated to /home" },
    ],
  },
  {
    id: "igr_keys",
    title: "React key prop missing in product list map — console warnings in development",
    root_cause: "The product list renders without unique key props, causing React reconciliation warnings. No user-facing impact but pollutes developer console.",
    suggested_fix: "Add key={product.id} to the root element in the product list .map() call.",
    severity: "P3",
    status: "ignored",
    confidence: 0.72,
    affected_session_count: 3,
    first_seen_at: Date.now() - 1000 * 60 * 60 * 96,
    last_seen_at: Date.now() - 1000 * 60 * 60 * 48,
    github_issue_url: null,
    github_issue_number: null,
    github_auto_raised: false,
    reproduction_steps: [
      "Open /products in development mode",
      "Observe React key prop warning in console",
    ],
    evidence: [
      { type: "console_error", timestamp_ms: 320, detail: "Warning: Each child in a list should have a unique 'key' prop" },
    ],
  },
]

export const mockSessions: Session[] = [
  {
    id: "ses_x9y8z7",
    url: "/checkout",
    user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124",
    screen_width: 1440,
    screen_height: 900,
    release: "web-2026.05.08",
    commit_sha: "a81f9d",
    environment: "production",
    duration_ms: 142000,
    started_at: Date.now() - 1000 * 60 * 62 * 2,
    has_js_error: true,
    has_rage_click: true,
    has_network_err: true,
    has_dead_click: false,
    error_count: 2,
    issue_instance_count: 2,
    ai_session_summary: "User attempted to complete a checkout but was unable to submit payment. After clicking the pay button, a POST /api/payment returned 500, causing the page to freeze. User rage-clicked 4 times before abandoning.",
    ai_goal_completed: false,
    ai_friction_score: 92,
    ai_triage_confidence: 0.97,
    timeline: [
      { type: "navigation",    timestamp_ms: 0,     nav_to: "/checkout" },
      { type: "click",         timestamp_ms: 12400, target: "#pay-btn" },
      { type: "network_error", timestamp_ms: 12450, network_url: "/api/payment", network_status: 500, network_method: "POST" },
      { type: "rage_click",    timestamp_ms: 12500, target: "#pay-btn", click_count: 4 },
      { type: "js_error",      timestamp_ms: 12510, error_message: "TypeError: Cannot read properties of undefined (reading 'id')", error_stack: "at PaymentHandler (checkout.js:142)\nat handleSubmit (checkout.js:89)\nat HTMLButtonElement.onClick (checkout.js:61)" },
    ],
  },
  {
    id: "ses_m3n4p5",
    url: "/dashboard",
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124",
    screen_width: 1920,
    screen_height: 1080,
    release: "web-2026.05.08",
    commit_sha: "a81f9d",
    environment: "production",
    duration_ms: 88000,
    started_at: Date.now() - 1000 * 60 * 60 * 4,
    has_js_error: false,
    has_rage_click: false,
    has_network_err: true,
    has_dead_click: false,
    error_count: 1,
    issue_instance_count: 1,
    ai_session_summary: "User loaded the dashboard but was immediately redirected to /login due to an expired JWT. The redirect loop prevented them from accessing any content.",
    ai_goal_completed: false,
    ai_friction_score: 85,
    ai_triage_confidence: 0.91,
    timeline: [
      { type: "navigation",    timestamp_ms: 0,    nav_to: "/dashboard" },
      { type: "network_error", timestamp_ms: 820,  network_url: "/api/user", network_status: 401, network_method: "GET" },
      { type: "navigation",    timestamp_ms: 850,  nav_to: "/login" },
      { type: "navigation",    timestamp_ms: 1100, nav_to: "/dashboard" },
    ],
  },
  {
    id: "ses_q7r8s9",
    url: "/checkout",
    user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1",
    screen_width: 390,
    screen_height: 844,
    release: "web-2026.05.08",
    commit_sha: "a81f9d",
    environment: "production",
    duration_ms: 174000,
    started_at: Date.now() - 1000 * 60 * 60 * 5,
    has_js_error: true,
    has_rage_click: true,
    has_network_err: false,
    has_dead_click: true,
    error_count: 1,
    issue_instance_count: 1,
    ai_session_summary: "Mobile user attempted checkout. Promo code input became unresponsive after a failed code attempt. User rage-clicked the apply button 5 times before giving up.",
    ai_goal_completed: false,
    ai_friction_score: 78,
    ai_triage_confidence: 0.88,
    timeline: [
      { type: "navigation", timestamp_ms: 0,    nav_to: "/checkout" },
      { type: "click",      timestamp_ms: 4200, target: "#promo-apply-btn" },
      { type: "network_error", timestamp_ms: 4350, network_url: "/api/promo", network_status: 422, network_method: "POST" },
      { type: "rage_click", timestamp_ms: 5800, target: "#promo-apply-btn", click_count: 5 },
      { type: "dead_click", timestamp_ms: 9200, target: "#promo-apply-btn" },
    ],
  },
  {
    id: "ses_t1u2v3",
    url: "/checkout/address",
    user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/537.36",
    screen_width: 1440,
    screen_height: 900,
    release: "web-2026.05.07",
    commit_sha: "b92e1f",
    environment: "production",
    duration_ms: 195000,
    started_at: Date.now() - 1000 * 60 * 60 * 7,
    has_js_error: false,
    has_rage_click: false,
    has_network_err: true,
    has_dead_click: false,
    error_count: 1,
    issue_instance_count: 1,
    ai_session_summary: "User entered a postcode without a space separator. Form accepted it client-side, but the shipping API returned 422. Generic error message shown with no field-level feedback.",
    ai_goal_completed: false,
    ai_friction_score: 65,
    ai_triage_confidence: 0.84,
    timeline: [
      { type: "navigation",    timestamp_ms: 0,    nav_to: "/checkout/address" },
      { type: "click",         timestamp_ms: 8200, target: "#place-order-btn" },
      { type: "network_error", timestamp_ms: 8450, network_url: "/api/shipping", network_status: 422, network_method: "POST" },
    ],
  },
  {
    id: "ses_w4x5y6",
    url: "/products",
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/125.0",
    screen_width: 1366,
    screen_height: 768,
    release: "web-2026.05.08",
    commit_sha: "a81f9d",
    environment: "production",
    duration_ms: 320000,
    started_at: Date.now() - 1000 * 60 * 60 * 10,
    has_js_error: false,
    has_rage_click: false,
    has_network_err: false,
    has_dead_click: false,
    error_count: 0,
    issue_instance_count: 0,
    ai_session_summary: "User browsed the products page, filtered by category, and added two items to cart. Completed the flow without friction.",
    ai_goal_completed: true,
    ai_friction_score: 12,
    ai_triage_confidence: 0.89,
    timeline: [
      { type: "navigation", timestamp_ms: 0,      nav_to: "/products" },
      { type: "click",      timestamp_ms: 8400,   target: "#filter-shoes" },
      { type: "click",      timestamp_ms: 24000,  target: "#add-to-cart-1" },
      { type: "navigation", timestamp_ms: 26000,  nav_to: "/cart" },
    ],
  },
  {
    id: "ses_a1b2c3",
    url: "/products/shoes",
    user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) Chrome/124",
    screen_width: 1440,
    screen_height: 900,
    release: "web-2026.05.08",
    commit_sha: "a81f9d",
    environment: "production",
    duration_ms: 200000,
    started_at: Date.now() - 1000 * 60 * 60 * 12,
    has_js_error: false,
    has_rage_click: false,
    has_network_err: false,
    has_dead_click: false,
    error_count: 0,
    issue_instance_count: 0,
    ai_session_summary: "User browsed the shoes category, viewed product detail for two items, and added one to cart.",
    ai_goal_completed: true,
    ai_friction_score: 8,
    ai_triage_confidence: 0.92,
    timeline: [
      { type: "navigation", timestamp_ms: 0,     nav_to: "/products/shoes" },
      { type: "click",      timestamp_ms: 6200,  target: "#product-card-2" },
      { type: "navigation", timestamp_ms: 6240,  nav_to: "/products/shoes/2" },
      { type: "click",      timestamp_ms: 22000, target: "#add-to-cart" },
    ],
  },
  {
    id: "ses_j1k2l3",
    url: "/checkout",
    user_agent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) Chrome/124",
    screen_width: 412,
    screen_height: 915,
    release: "web-2026.05.08",
    commit_sha: "a81f9d",
    environment: "production",
    duration_ms: 95000,
    started_at: Date.now() - 1000 * 60 * 60 * 22,
    has_js_error: true,
    has_rage_click: true,
    has_network_err: true,
    has_dead_click: false,
    error_count: 3,
    issue_instance_count: 2,
    ai_session_summary: "Android mobile user hit the same payment 503 error. No retry option. Abandoned checkout after 3 failed attempts.",
    ai_goal_completed: false,
    ai_friction_score: 90,
    ai_triage_confidence: 0.93,
    timeline: [
      { type: "navigation",    timestamp_ms: 0,     nav_to: "/checkout" },
      { type: "click",         timestamp_ms: 5400,  target: "#pay-btn" },
      { type: "network_error", timestamp_ms: 13400, network_url: "/api/payment", network_status: 503, network_method: "POST" },
      { type: "rage_click",    timestamp_ms: 13500, target: "#pay-btn", click_count: 3 },
    ],
  },
  {
    id: "ses_p7q8r9",
    url: "/checkout",
    user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/537.36",
    screen_width: 1440,
    screen_height: 900,
    release: "web-2026.05.06",
    commit_sha: "c73d2a",
    environment: "preview",
    duration_ms: 55000,
    started_at: Date.now() - 1000 * 60 * 60 * 24,
    has_js_error: false,
    has_rage_click: false,
    has_network_err: true,
    has_dead_click: false,
    error_count: 1,
    issue_instance_count: 1,
    ai_session_summary: "Preview environment session. User tested checkout flow. Shipping API returned 422 for the test postcode used.",
    ai_goal_completed: false,
    ai_friction_score: 55,
    ai_triage_confidence: 0.76,
    timeline: [
      { type: "navigation",    timestamp_ms: 0,    nav_to: "/checkout" },
      { type: "network_error", timestamp_ms: 8100, network_url: "/api/shipping", network_status: 422, network_method: "POST" },
    ],
  },
]
