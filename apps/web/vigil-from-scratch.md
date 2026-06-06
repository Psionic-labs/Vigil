# Vigil Dashboard — Build From Scratch
> Fresh start. No existing code to reference. Build everything from zero.
> Every file in this prompt is complete and final. No stubs, no TODOs, no placeholders.

---

## What You Are Building

**Vigil** is an AI-native bug triage platform for developers. It captures real user sessions,
runs an AI analysis pass over every session, clusters repeated failures into deduplicated issue
groups, and gives developers a prioritized queue of GitHub-ready bug reports.

This is the **internal product dashboard** — used exclusively by developers. Not a consumer app.
Think Linear, Vercel dashboard, Raycast. Dense, precise, built for people who read stack traces.

---

## Tech Stack — Exactly This, Nothing Else

- **Next.js 15** with App Router
- **Tailwind CSS v4** (CSS-first config — NO tailwind.config.ts)
- **TypeScript**
- **Lucide React** for icons
- **Geist font** (already installed via `geist` npm package)
- **Framer Motion** for micro-animations only
- NO shadcn, NO Radix, NO Headless UI, NO other component libraries
- NO charts, NO heavy dependencies

---

## Design Direction

**Aesthetic:** Refined industrial. Deep navy/indigo sidebar. Crisp white content area.
Strong contrast between the two. Reference: Rubick dashboard (image provided) — that
exact split between a rich dark sidebar and a clean white main area with well-structured cards.

**Color palette — use these exact values:**

```
Sidebar bg:        #1e1b4b  (indigo-950)
Sidebar active:    #4f46e5  (indigo-600)
Sidebar hover:     #312e81  (indigo-900)
Sidebar text:      #c7d2fe  (indigo-200)
Sidebar muted:     #818cf8  (indigo-400)

Content bg:        #f8fafc  (slate-50)
Card bg:           #ffffff
Card border:       #e2e8f0  (slate-200)
Surface 2:         #f1f5f9  (slate-100)

Text primary:      #0f172a  (slate-900)
Text secondary:    #475569  (slate-600)
Text muted:        #94a3b8  (slate-400)

Accent:            #6366f1  (indigo-500)
Accent light:      #eef2ff  (indigo-50)
Accent dark:       #4338ca  (indigo-700)

P0 (Critical):     #dc2626  bg: #fee2e2
P1 (High):         #ea580c  bg: #ffedd5
P2 (Medium):       #ca8a04  bg: #fef9c3
P3 (Low):          #64748b  bg: #f1f5f9

Success:           #16a34a  bg: #dcfce7
```

**Typography:** Use Geist Sans for all UI text. Use Geist Mono for IDs, code, timestamps,
numbers in tables. These are already installed — import from `geist/font/sans` and `geist/font/mono`.

**Spacing philosophy:** Cards have `p-5` or `p-6`. Rows have `px-5 py-3.5`. Section gaps use
`gap-6`. Lists use `space-y-2`. Be generous but not wasteful.

**Shadows:** Cards use `shadow-sm`. Hover state adds `shadow-md`. No dramatic shadows.

**Animations:** Staggered `fadeUp` on list items. Smooth hover transitions at 150ms.
Nothing more. This is a triage tool, not a marketing page.

---

## File Structure — Create All of These

```
app/
  layout.tsx
  page.tsx                    ← Overview
  issues/
    page.tsx
    [id]/
      page.tsx
  sessions/
    page.tsx
    [id]/
      page.tsx
  settings/
    page.tsx

components/
  layout/
    Sidebar.tsx
    NavItem.tsx
    TopBar.tsx
  ui/
    StatCard.tsx
    IssueBadge.tsx
    ConfidenceBadge.tsx
    FrictionBar.tsx
    EnvironmentChip.tsx
    SignalIcons.tsx
    PageHeader.tsx
    CodeBlock.tsx
    Toggle.tsx
    EmptyState.tsx
    SkeletonRow.tsx

lib/
  mock-data.ts
  utils.ts

app/
  globals.css
```

---

## GLOBALS.CSS — Paste This Exactly

```css
@import "tailwindcss";

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0);    }
}
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

:root {
  --sidebar:        30 27 75;
  --sidebar-active: 79 70 229;
  --sidebar-hover:  49 46 129;
  --sidebar-text:   199 210 254;
  --sidebar-muted:  129 140 248;

  --bg:        248 250 252;
  --surface:   255 255 255;
  --surface-2: 241 245 249;
  --border:    226 232 240;

  --text-1: 15  23  42;
  --text-2: 71  85  105;
  --text-3: 148 163 184;

  --accent:       99  102 241;
  --accent-light: 238 242 255;
  --accent-dark:  67  56  202;

  --p0: 220 38  38;   --p0-bg: 254 226 226;
  --p1: 234 88  12;   --p1-bg: 255 237 213;
  --p2: 202 138 4;    --p2-bg: 254 249 195;
  --p3: 100 116 139;  --p3-bg: 241 245 249;

  --ok: 22 163 74;    --ok-bg: 220 252 231;
}

@theme {
  --color-sidebar:        rgb(var(--sidebar));
  --color-sidebar-active: rgb(var(--sidebar-active));
  --color-sidebar-hover:  rgb(var(--sidebar-hover));
  --color-sidebar-text:   rgb(var(--sidebar-text));
  --color-sidebar-muted:  rgb(var(--sidebar-muted));

  --color-bg:        rgb(var(--bg));
  --color-surface:   rgb(var(--surface));
  --color-surface-2: rgb(var(--surface-2));
  --color-border:    rgb(var(--border));

  --color-text-1: rgb(var(--text-1));
  --color-text-2: rgb(var(--text-2));
  --color-text-3: rgb(var(--text-3));

  --color-accent:       rgb(var(--accent));
  --color-accent-light: rgb(var(--accent-light));
  --color-accent-dark:  rgb(var(--accent-dark));

  --color-p0: rgb(var(--p0));  --color-p0-bg: rgb(var(--p0-bg));
  --color-p1: rgb(var(--p1));  --color-p1-bg: rgb(var(--p1-bg));
  --color-p2: rgb(var(--p2));  --color-p2-bg: rgb(var(--p2-bg));
  --color-p3: rgb(var(--p3));  --color-p3-bg: rgb(var(--p3-bg));

  --color-ok: rgb(var(--ok));  --color-ok-bg: rgb(var(--ok-bg));

  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, monospace;
}

*, *::before, *::after { box-sizing: border-box; }
html, body { height: 100%; }
body { background-color: rgb(var(--bg)); font-family: var(--font-sans); }

*:focus-visible {
  outline: 2px solid rgb(var(--accent));
  outline-offset: 2px;
  border-radius: 4px;
}

.animate-fade-up {
  animation: fadeUp 0.3s ease-out both;
}
.animate-shimmer {
  background: linear-gradient(90deg, rgb(var(--surface-2)) 25%, rgb(var(--surface)) 50%, rgb(var(--surface-2)) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.6s linear infinite;
}
```

---

## APP/LAYOUT.TSX

```tsx
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import "./globals.css"
import { Sidebar } from "@/components/layout/Sidebar"

export const metadata: Metadata = {
  title: "Vigil — AI Bug Triage",
  description: "AI-native session triage for developers",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="flex h-screen overflow-hidden bg-bg font-sans antialiased" suppressHydrationWarning>
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-bg">
          {children}
        </main>
      </body>
    </html>
  )
}
```

---

## LIB/MOCK-DATA.TS — All Data Lives Here

```typescript
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
```

---

## LIB/UTILS.TS

```typescript
export function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24)   return `${hours}h ago`
  return `${days}d ago`
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}

export function formatTimestamp(ms: number): string {
  const s = (ms / 1000).toFixed(1)
  return `+${s}s`
}

export function severityColor(s: string) {
  const map: Record<string, { text: string; bg: string; border: string; dot: string; accent: string }> = {
    P0: { text: "text-p0",  bg: "bg-p0-bg",  border: "border-red-200",    dot: "bg-p0",  accent: "border-l-p0"  },
    P1: { text: "text-p1",  bg: "bg-p1-bg",  border: "border-orange-200", dot: "bg-p1",  accent: "border-l-p1"  },
    P2: { text: "text-p2",  bg: "bg-p2-bg",  border: "border-yellow-200", dot: "bg-p2",  accent: "border-l-p2"  },
    P3: { text: "text-p3",  bg: "bg-p3-bg",  border: "border-slate-200",  dot: "bg-p3",  accent: "border-l-p3"  },
  }
  return map[s] ?? map.P3
}
```

---

## COMPONENTS/LAYOUT/SIDEBAR.TSX

```tsx
"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, AlertTriangle, Monitor, Settings, ChevronDown, Activity } from "lucide-react"
import { mockIssues } from "@/lib/mock-data"

const openCount = mockIssues.filter(i => i.status === "open").length

const navItems = [
  { href: "/",         label: "Overview",  icon: LayoutDashboard },
  { href: "/issues",   label: "Issues",    icon: AlertTriangle,   badge: openCount },
  { href: "/sessions", label: "Sessions",  icon: Monitor },
  { href: "/settings", label: "Settings",  icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 bg-sidebar flex flex-col shrink-0 h-full">
      {/* Logo */}
      <div className="px-5 pt-5 pb-4 border-b border-indigo-800/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shadow-lg">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-white text-base tracking-tight">Vigil</span>
          <span className="ml-auto text-xs font-mono text-sidebar-muted bg-indigo-900/60 px-1.5 py-0.5 rounded">
            v0.1
          </span>
        </div>
      </div>

      {/* Project switcher */}
      <div className="px-3 py-3 border-b border-indigo-800/60">
        <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg
                           bg-indigo-900/50 border border-indigo-700/50
                           hover:bg-indigo-900 transition-colors">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          <span className="text-sm text-sidebar-text font-medium flex-1 text-left truncate">
            Checkout App
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-sidebar-muted shrink-0" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-widest text-sidebar-muted">
          Menu
        </p>
        {navItems.map(({ href, label, icon: Icon, badge }) => {
          const isActive = pathname === href || (href !== "/" && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium
                ${isActive
                  ? "bg-sidebar-active text-white shadow-sm"
                  : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
                }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {badge !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold
                  ${isActive ? "bg-white/20 text-white" : "bg-indigo-800 text-sidebar-muted"}`}>
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 border-t border-indigo-800/60 pt-3">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-white">N</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-text truncate">dev@acme.io</p>
            <p className="text-xs text-sidebar-muted">Owner</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
```

---

## SHARED UI COMPONENTS

### components/ui/IssueBadge.tsx

```tsx
import { severityColor } from "@/lib/utils"

export function IssueBadge({ severity }: { severity: string }) {
  const c = severityColor(severity)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                      text-xs font-bold border whitespace-nowrap
                      ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      {severity}
    </span>
  )
}
```

### components/ui/ConfidenceBadge.tsx

```tsx
export function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 90 ? "text-ok" : pct >= 75 ? "text-p2" : "text-p3"
  return (
    <span className={`font-mono text-xs font-semibold bg-surface-2
                      border border-border px-2 py-0.5 rounded-md ${color}`}>
      {pct}%
    </span>
  )
}
```

### components/ui/FrictionBar.tsx

```tsx
export function FrictionBar({ score, className = "" }: { score: number; className?: string }) {
  const bar  = score >= 80 ? "bg-p0" : score >= 60 ? "bg-p1" : score >= 30 ? "bg-p2" : "bg-ok"
  const text = score >= 80 ? "text-p0" : score >= 60 ? "text-p1" : score >= 30 ? "text-p2" : "text-ok"
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden min-w-[56px]">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-mono font-bold w-6 shrink-0 text-right ${text}`}>{score}</span>
    </div>
  )
}
```

### components/ui/EnvironmentChip.tsx

```tsx
export function EnvironmentChip({ env }: { env: string | null }) {
  if (!env) return null
  const s: Record<string, string> = {
    production:  "bg-green-50  text-green-700  border-green-200",
    preview:     "bg-amber-50  text-amber-700  border-amber-200",
    development: "bg-slate-100 text-slate-600  border-slate-200",
  }
  return (
    <span className={`text-xs font-bold uppercase tracking-wide
                      px-2 py-0.5 rounded border ${s[env] ?? s.development}`}>
      {env === "production" ? "PROD" : env.toUpperCase()}
    </span>
  )
}
```

### components/ui/SignalIcons.tsx

```tsx
import { AlertTriangle, WifiOff, MousePointerClick, MousePointer } from "lucide-react"

interface Signals {
  has_js_error: boolean; has_network_err: boolean
  has_rage_click: boolean; has_dead_click: boolean
}

export function SignalIcons({ signals }: { signals: Signals }) {
  return (
    <div className="flex items-center gap-1.5">
      {signals.has_js_error    && <AlertTriangle      className="w-3.5 h-3.5 text-p1" title="JS Error" />}
      {signals.has_network_err && <WifiOff            className="w-3.5 h-3.5 text-p0" title="Network Error" />}
      {signals.has_rage_click  && <MousePointerClick  className="w-3.5 h-3.5 text-p2" title="Rage Click" />}
      {signals.has_dead_click  && <MousePointer       className="w-3.5 h-3.5 text-text-3" title="Dead Click" />}
      {!signals.has_js_error && !signals.has_network_err && !signals.has_rage_click && !signals.has_dead_click && (
        <span className="text-xs text-text-3">—</span>
      )}
    </div>
  )
}
```

### components/ui/PageHeader.tsx

```tsx
export function PageHeader({
  title, subtitle, count, countLabel = "open", actions,
}: {
  title: string; subtitle?: string; count?: number
  countLabel?: string; actions?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-7">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-text-1 tracking-tight">{title}</h1>
          {count !== undefined && (
            <span className="px-2.5 py-0.5 text-sm font-semibold rounded-full
                             bg-accent-light text-accent">
              {count} {countLabel}
            </span>
          )}
        </div>
        {subtitle && <p className="text-sm text-text-2 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  )
}
```

### components/ui/StatCard.tsx

```tsx
import type { LucideIcon } from "lucide-react"

interface Props {
  label: string; value: string | number; subtext?: string
  trend?: { label: string; positive: boolean }
  icon: LucideIcon
  leftBorderClass: string   // e.g. "border-l-p0"
  iconBg: string            // e.g. "bg-p0-bg"
  iconColor: string         // e.g. "text-p0"
}

export function StatCard({ label, value, subtext, trend, icon: Icon, leftBorderClass, iconBg, iconColor }: Props) {
  return (
    <div className={`bg-surface rounded-2xl border border-border p-5
                     border-l-[3px] ${leftBorderClass}
                     shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-3">{label}</p>
          <p className="text-3xl font-bold text-text-1 mt-1.5 leading-none tracking-tight">{value}</p>
          {subtext && <p className="text-xs text-text-3 mt-1">{subtext}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold
                            px-2 py-0.5 rounded-full
                            ${trend.positive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
            {trend.positive ? "↑" : "↓"} {trend.label}
          </span>
          <span className="text-xs text-text-3">vs last week</span>
        </div>
      )}
    </div>
  )
}
```

### components/ui/Toggle.tsx

```tsx
"use client"
export function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch" aria-checked={checked} onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200
                  ${checked ? "bg-accent" : "bg-border"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white
                        shadow-sm transition-transform duration-200
                        ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  )
}
```

### components/ui/EmptyState.tsx

```tsx
import type { LucideIcon } from "lucide-react"

export function EmptyState({ icon: Icon, title, description }: {
  icon: LucideIcon; title: string; description: string
}) {
  return (
    <div className="py-20 flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-2xl bg-accent-light flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-accent" />
      </div>
      <p className="text-sm font-semibold text-text-1">{title}</p>
      <p className="text-xs text-text-3 mt-1.5 max-w-xs leading-relaxed">{description}</p>
    </div>
  )
}
```

---

## APP/PAGE.TSX — Overview Dashboard

```tsx
import { AlertTriangle, Activity, Monitor, CheckCircle, ArrowRight } from "lucide-react"
import { StatCard } from "@/components/ui/StatCard"
import { IssueBadge } from "@/components/ui/IssueBadge"
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge"
import { FrictionBar } from "@/components/ui/FrictionBar"
import { PageHeader } from "@/components/ui/PageHeader"
import { EnvironmentChip } from "@/components/ui/EnvironmentChip"
import { mockIssues, mockSessions } from "@/lib/mock-data"
import { formatRelativeTime, formatDuration } from "@/lib/utils"
import Link from "next/link"

const severityBreakdown = [
  { label: "Critical", key: "P0", borderClass: "border-t-p0",  dotClass: "bg-p0",  textClass: "text-p0"  },
  { label: "High",     key: "P1", borderClass: "border-t-p1",  dotClass: "bg-p1",  textClass: "text-p1"  },
  { label: "Medium",   key: "P2", borderClass: "border-t-p2",  dotClass: "bg-p2",  textClass: "text-p2"  },
  { label: "Low",      key: "P3", borderClass: "border-t-p3",  dotClass: "bg-p3",  textClass: "text-p3"  },
]

export default function OverviewPage() {
  const recentIssues = mockIssues.filter(i => i.status !== "ignored").slice(0, 4)
  const highFrictionSessions = [...mockSessions]
    .sort((a, b) => b.ai_friction_score - a.ai_friction_score)
    .slice(0, 3)

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <PageHeader
        title="Overview Dashboard"
        subtitle="Here's a summary of your app's health and recent AI triage results."
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-7">
        <StatCard label="Open Issues"       value={7}    trend={{ label: "+3 this week", positive: false }}  subtext="vs last week"          icon={AlertTriangle} leftBorderClass="border-l-p0"     iconBg="bg-p0-bg"        iconColor="text-p0"     />
        <StatCard label="Avg Friction Score" value={49}   trend={{ label: "+4 points",    positive: false }}  subtext="since latest release"  icon={Activity}      leftBorderClass="border-l-p1"     iconBg="bg-p1-bg"        iconColor="text-p1"     />
        <StatCard label="Total Sessions"    value={12}                                                        subtext="Last 24 hours"         icon={Monitor}       leftBorderClass="border-l-accent"  iconBg="bg-accent-light" iconColor="text-accent" />
        <StatCard label="Goal Completion"   value="25%"  trend={{ label: "+12% this week", positive: true }} subtext="vs last week"          icon={CheckCircle}   leftBorderClass="border-l-ok"     iconBg="bg-ok-bg"        iconColor="text-ok"     />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Left panel */}
        <div className="xl:col-span-2 space-y-5">

          {/* Severity breakdown */}
          <div className="bg-surface rounded-2xl border border-border p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-text-1 mb-4">Severity Breakdown</h2>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {severityBreakdown.map(({ label, key, borderClass, dotClass, textClass }) => {
                const count = mockIssues.filter(i => i.severity === key && i.status !== "ignored").length
                return (
                  <div key={key} className={`bg-surface-2 rounded-xl border border-border border-t-[3px] ${borderClass} p-3.5 text-center`}>
                    <p className={`text-2xl font-bold ${textClass}`}>{count}</p>
                    <div className="flex items-center justify-center gap-1.5 mt-1">
                      <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                      <span className="text-xs text-text-2">{label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="space-y-2.5">
              {severityBreakdown.map(({ label, key, dotClass }) => {
                const count = mockIssues.filter(i => i.severity === key && i.status !== "ignored").length
                const total = mockIssues.filter(i => i.status !== "ignored").length
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 w-24 shrink-0">
                      <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                      <span className="text-xs text-text-2">{key} {label}</span>
                    </div>
                    <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${dotClass}`} style={{ width: `${(count / total) * 100}%` }} />
                    </div>
                    <span className="text-xs font-mono text-text-3 w-4 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* AI Insights */}
          <div className="bg-surface rounded-2xl border border-border p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3.5">
              <div className="w-6 h-6 rounded-md bg-accent-light flex items-center justify-center">
                <span className="text-accent text-xs font-bold">✦</span>
              </div>
              <h2 className="text-sm font-semibold text-text-1">Vigil AI Insights</h2>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-text-2">
              <p>
                <span className="font-semibold text-text-1">Checkout Friction: </span>
                High friction detected in recent{" "}
                <code className="text-xs bg-surface-2 border border-border px-1.5 py-0.5 rounded font-mono text-accent">/checkout</code>
                {" "}sessions due to a 503 error from the payment API.
              </p>
              <p>
                <span className="font-semibold text-text-1">JS Errors: </span>
                <code className="text-xs bg-red-50 border border-red-100 px-1.5 py-0.5 rounded font-mono text-p0">TypeError: Cannot read properties</code>
                {" "}is spiking on mobile devices.
              </p>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="xl:col-span-3 space-y-5">

          {/* Recent triage inbox */}
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-sm font-semibold text-text-1">Recent Triage Inbox</h2>
              <Link href="/issues" className="text-xs text-accent hover:text-accent-dark font-medium transition-colors flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {recentIssues.map(issue => (
                <Link
                  key={issue.id}
                  href={`/issues/${issue.id}`}
                  className="flex items-start gap-3.5 px-5 py-3.5 hover:bg-surface-2 transition-colors group"
                >
                  <IssueBadge severity={issue.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-1 truncate group-hover:text-accent transition-colors">
                      {issue.title}
                    </p>
                    <p className="text-xs text-text-3 mt-0.5 truncate">{issue.root_cause}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs font-bold text-text-1">{issue.affected_session_count}</p>
                      <p className="text-xs text-text-3 leading-none">sessions</p>
                    </div>
                    <ConfidenceBadge value={issue.confidence} />
                    <span className="text-xs text-text-3 w-12 text-right">
                      {formatRelativeTime(issue.last_seen_at)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* High friction sessions */}
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-sm font-semibold text-text-1">Recent High-Friction Sessions</h2>
              <Link href="/sessions" className="text-xs text-accent hover:text-accent-dark font-medium transition-colors flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {highFrictionSessions.map(session => (
                <Link
                  key={session.id}
                  href={`/sessions/${session.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors group"
                >
                  <span className="font-mono text-xs text-text-3 w-24 shrink-0 truncate">{session.id}</span>
                  <span className="text-xs text-text-2 w-24 shrink-0 truncate">{session.url}</span>
                  <FrictionBar score={session.ai_friction_score} className="flex-1" />
                  <span className="text-xs text-p0 flex items-center gap-1 shrink-0 w-20">
                    <span>✕</span> Goal Failed
                  </span>
                  <span className="font-mono text-xs text-text-3 w-14 shrink-0 text-right">
                    {formatDuration(session.duration_ms)}
                  </span>
                  <EnvironmentChip env={session.environment} />
                  <span className="text-xs text-text-3 w-12 text-right shrink-0">
                    {formatRelativeTime(session.started_at)}
                  </span>
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
```

---

## APP/ISSUES/PAGE.TSX

```tsx
"use client"
import { useState } from "react"
import { Search, ArrowUpDown, Github, ExternalLink } from "lucide-react"
import { IssueBadge } from "@/components/ui/IssueBadge"
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge"
import { PageHeader } from "@/components/ui/PageHeader"
import { EmptyState } from "@/components/ui/EmptyState"
import { mockIssues } from "@/lib/mock-data"
import { formatRelativeTime } from "@/lib/utils"
import Link from "next/link"

type Filter = "All" | "P0" | "P1" | "P2" | "P3" | "Linked to GitHub" | "Ignored"
const FILTERS: Filter[] = ["All", "P0", "P1", "P2", "P3", "Linked to GitHub", "Ignored"]

export default function IssuesPage() {
  const [filter, setFilter] = useState<Filter>("All")
  const [search, setSearch] = useState("")

  const visible = mockIssues.filter(issue => {
    const q = search.toLowerCase()
    const matchSearch = !q || issue.title.toLowerCase().includes(q) || issue.root_cause.toLowerCase().includes(q)
    const matchFilter =
      filter === "All"               ? true :
      filter === "Linked to GitHub"  ? !!issue.github_issue_url :
      filter === "Ignored"           ? issue.status === "ignored" :
      issue.severity === filter
    return matchSearch && matchFilter
  })

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <PageHeader title="Issues" count={mockIssues.filter(i => i.status === "open").length} />

      {/* Controls row */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search issues..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-surface border border-border rounded-xl
                       text-text-1 placeholder:text-text-3 focus:outline-none focus:ring-2
                       focus:ring-accent/30 focus:border-accent transition-all"
          />
        </div>
        <button className="ml-auto flex items-center gap-2 px-3.5 py-2 text-sm text-text-2
                           bg-surface border border-border rounded-xl hover:border-accent/40 transition-all">
          <ArrowUpDown className="w-3.5 h-3.5" />
          Sort: Severity
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all
              ${filter === f
                ? "bg-accent text-white border-accent shadow-sm"
                : "bg-surface text-text-2 border-border hover:border-accent/40 hover:text-accent"}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Issue rows */}
      {visible.length === 0 ? (
        <EmptyState icon={Search} title="No issues found" description="Try adjusting your search or filter criteria." />
      ) : (
        <div className="space-y-2">
          {visible.map((issue, i) => (
            <Link
              key={issue.id}
              href={`/issues/${issue.id}`}
              className="animate-fade-up flex items-center gap-4 bg-surface border border-border
                         rounded-2xl px-5 py-4 hover:shadow-md hover:border-accent/30
                         transition-all group block"
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <IssueBadge severity={issue.severity} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-1 truncate group-hover:text-accent transition-colors">
                  {issue.title}
                </p>
                <p className="text-xs text-text-3 mt-0.5 truncate">{issue.root_cause}</p>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-text-1">{issue.affected_session_count}</p>
                  <p className="text-xs text-text-3 leading-none">sessions</p>
                </div>
                <ConfidenceBadge value={issue.confidence} />
                <span className="text-xs text-text-3 w-14 text-right">
                  {formatRelativeTime(issue.last_seen_at)}
                </span>
                {issue.github_issue_url ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-green-700
                                   bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                    <Github className="w-3 h-3" />
                    #{issue.github_issue_number}
                  </span>
                ) : (
                  <span className="w-[72px]" />
                )}
                {issue.github_auto_raised && (
                  <span className="text-xs font-medium bg-amber-50 text-amber-700
                                   border border-amber-200 px-2 py-0.5 rounded-full">
                    auto
                  </span>
                )}
                {issue.status === "ignored" && (
                  <span className="text-xs font-medium bg-surface-2 text-text-3
                                   border border-border px-2 py-0.5 rounded-full">
                    ignored
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## APP/SESSIONS/PAGE.TSX

```tsx
"use client"
import { useState } from "react"
import { Search, ArrowRight, ArrowUpDown } from "lucide-react"
import { FrictionBar } from "@/components/ui/FrictionBar"
import { SignalIcons } from "@/components/ui/SignalIcons"
import { EnvironmentChip } from "@/components/ui/EnvironmentChip"
import { PageHeader } from "@/components/ui/PageHeader"
import { EmptyState } from "@/components/ui/EmptyState"
import { mockSessions } from "@/lib/mock-data"
import { formatRelativeTime, formatDuration } from "@/lib/utils"
import Link from "next/link"

type Filter = "All" | "Has Issues" | "Goal Failed" | "Has JS Error" | "Has Rage Click" | "Production only"
const FILTERS: Filter[] = ["All", "Has Issues", "Goal Failed", "Has JS Error", "Has Rage Click", "Production only"]

export default function SessionsPage() {
  const [filter, setFilter] = useState<Filter>("All")
  const [search, setSearch] = useState("")

  const visible = mockSessions.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q || s.id.includes(q) || s.url.includes(q)
    const matchFilter =
      filter === "All"              ? true :
      filter === "Has Issues"       ? s.issue_instance_count > 0 :
      filter === "Goal Failed"      ? !s.ai_goal_completed :
      filter === "Has JS Error"     ? s.has_js_error :
      filter === "Has Rage Click"   ? s.has_rage_click :
      filter === "Production only"  ? s.environment === "production" :
      true
    return matchSearch && matchFilter
  })

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <PageHeader title="Sessions" count={mockSessions.length} countLabel="total" />

      <div className="flex items-center gap-3 mb-5">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-surface border border-border rounded-xl
                       text-text-1 placeholder:text-text-3 focus:outline-none focus:ring-2
                       focus:ring-accent/30 focus:border-accent transition-all"
          />
        </div>
        <button className="ml-auto flex items-center gap-2 px-3.5 py-2 text-sm text-text-2
                           bg-surface border border-border rounded-xl hover:border-accent/40 transition-all">
          <ArrowUpDown className="w-3.5 h-3.5" />
          Sort: Date
        </button>
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all
              ${filter === f
                ? "bg-accent text-white border-accent shadow-sm"
                : "bg-surface text-text-2 border-border hover:border-accent/40 hover:text-accent"}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[148px_1fr_180px_110px_60px_80px_100px_90px_36px]
                      gap-3 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider
                      text-text-3 mb-1.5 border-b border-border">
        <span>Session</span>
        <span>URL</span>
        <span>Friction</span>
        <span>Goal</span>
        <span>Issues</span>
        <span>Signals</span>
        <span>Duration</span>
        <span>Started</span>
        <span />
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Search} title="No sessions found" description="Try adjusting your search or filter." />
      ) : (
        <div className="space-y-1.5">
          {visible.map((session, i) => (
            <Link
              key={session.id}
              href={`/sessions/${session.id}`}
              className="animate-fade-up grid grid-cols-[148px_1fr_180px_110px_60px_80px_100px_90px_36px]
                         gap-3 items-center bg-surface border border-border rounded-2xl px-5 py-3.5
                         hover:shadow-md hover:border-accent/30 transition-all group"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <span className="font-mono text-xs text-text-3 truncate">{session.id}</span>
              <span className="text-sm text-text-2 truncate group-hover:text-accent transition-colors">
                {session.url}
              </span>
              <FrictionBar score={session.ai_friction_score} />
              <span className={`text-xs font-medium flex items-center gap-1
                ${session.ai_goal_completed ? "text-ok" : "text-p0"}`}>
                {session.ai_goal_completed ? "✓ Goal Met" : "✕ Failed"}
              </span>
              <span className={`text-xs font-mono font-bold text-center
                ${session.issue_instance_count > 0 ? "text-p0" : "text-text-3"}`}>
                {session.issue_instance_count > 0 ? session.issue_instance_count : "—"}
              </span>
              <SignalIcons signals={session} />
              <span className="font-mono text-xs text-text-3">{formatDuration(session.duration_ms)}</span>
              <EnvironmentChip env={session.environment} />
              <ArrowRight className="w-4 h-4 text-text-3 group-hover:text-accent transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## APP/SETTINGS/PAGE.TSX

```tsx
"use client"
import { useState } from "react"
import { Code2, Github, FolderOpen, Copy, Check, Eye, EyeOff } from "lucide-react"
import { PageHeader } from "@/components/ui/PageHeader"
import { Toggle } from "@/components/ui/Toggle"

function Section({ icon: Icon, title, description, children }: {
  icon: React.ElementType; title: string; description: string; children: React.ReactNode
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden mb-6">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-surface-2">
        <div className="w-8 h-8 rounded-xl bg-accent-light flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-accent" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-1">{title}</p>
          <p className="text-xs text-text-3">{description}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

const KEY = "pk_live_vg_c8f2a91d3e4b5f6a"

const SCRIPT_CODE = `<script src="https://cdn.vigil.dev/sdk.js" defer></script>
<script>
  Vigil.init({
    projectKey: "pk_live_vg_c8f2a91d3e4b5f6a",
    environment: "production",
    release: process.env.NEXT_PUBLIC_RELEASE,
  });
</script>`

const NPM_CODE = `npm install @vigil/sdk

// In your app entry point:
import { Vigil } from "@vigil/sdk";
Vigil.init({ projectKey: "pk_live_vg_c8f2a91d3e4b5f6a" });`

export default function SettingsPage() {
  const [keyVisible, setKeyVisible] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [autoRaise, setAutoRaise] = useState(true)
  const [followUp,  setFollowUp]  = useState(true)
  const [severity,  setSeverity]  = useState<"P0" | "P0+P1">("P0+P1")
  const [conf,      setConf]      = useState(90)

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const CopyBtn = ({ text, id }: { text: string; id: string }) => (
    <button onClick={() => copy(text, id)}
      className="flex items-center gap-1.5 text-xs text-text-3 hover:text-accent transition-colors">
      {copied === id
        ? <Check className="w-3.5 h-3.5 text-ok" />
        : <Copy className="w-3.5 h-3.5" />}
      {copied === id ? "Copied!" : "Copy"}
    </button>
  )

  const CodeBlock = ({ label, code, id }: { label: string; code: string; id: string }) => (
    <div className="rounded-xl overflow-hidden border border-border mb-4">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        <span className="text-xs font-mono text-zinc-400">{label}</span>
        <CopyBtn text={code} id={id} />
      </div>
      <pre className="bg-zinc-950 text-zinc-100 text-xs font-mono p-4 overflow-x-auto leading-relaxed whitespace-pre">
        {code}
      </pre>
    </div>
  )

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader title="Settings" subtitle="Manage configuration, API keys, and repository integrations." />

      <Section icon={Code2} title="SDK Installation" description="Add Vigil to your app with one script tag or npm package.">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2">Via Script Tag</p>
        <CodeBlock label="html" code={SCRIPT_CODE} id="script" />
        <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2 mt-5">Via NPM</p>
        <CodeBlock label="typescript" code={NPM_CODE} id="npm" />
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2">Project Key</p>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-2 border border-border rounded-xl">
            <span className="font-mono text-sm text-text-1 flex-1 truncate">
              {keyVisible ? KEY : `pk_live_${"•".repeat(16)}`}
            </span>
            <button onClick={() => setKeyVisible(v => !v)} className="text-text-3 hover:text-accent transition-colors">
              {keyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <CopyBtn text={KEY} id="key" />
          </div>
        </div>
      </Section>

      <Section icon={Github} title="GitHub Integration" description="Connect a repository to auto-raise issues from Vigil's dashboard.">
        <div className="flex items-center justify-between p-4 bg-surface-2 border border-border rounded-xl mb-5">
          <div className="flex items-center gap-3">
            <Github className="w-4 h-4 text-text-2" />
            <div>
              <p className="text-sm font-semibold text-text-1">acme/checkout-app</p>
              <span className="text-xs font-semibold text-ok bg-ok-bg border border-green-200 px-2 py-0.5 rounded-full">
                Connected
              </span>
            </div>
          </div>
          <button className="text-xs text-p0 hover:text-red-800 font-medium transition-colors
                             px-3 py-1.5 rounded-lg hover:bg-red-50">
            Disconnect
          </button>
        </div>

        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-text-1">Auto-raise Issues</p>
              <p className="text-xs text-text-3 mt-0.5">Automatically raise GitHub issues for high-severity bugs</p>
            </div>
            <Toggle checked={autoRaise} onChange={() => setAutoRaise(v => !v)} />
          </div>

          {autoRaise && (
            <div className="space-y-4 pt-4 border-t border-border">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2.5">Severity Threshold</p>
                <div className="flex gap-3">
                  {(["P0", "P0+P1"] as const).map(s => (
                    <button key={s} onClick={() => setSeverity(s)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all
                        ${severity === s
                          ? "bg-accent-light border-accent text-accent"
                          : "bg-surface border-border text-text-2 hover:border-accent/40"}`}>
                      <span className={`w-2 h-2 rounded-full ${severity === s ? "bg-accent" : "bg-border"}`} />
                      {s} only
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-3">Minimum Confidence</p>
                  <span className="text-sm font-bold font-mono text-accent">{conf}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <input type="range" min={50} max={100} value={conf}
                    onChange={e => setConf(Number(e.target.value))}
                    className="flex-1 accent-accent" />
                  <input type="number" min={50} max={100} value={conf}
                    onChange={e => setConf(Math.min(100, Math.max(50, Number(e.target.value))))}
                    className="w-16 text-center text-sm font-mono border border-border rounded-lg
                               py-1.5 bg-surface text-text-1 focus:outline-none focus:ring-2
                               focus:ring-accent/30 focus:border-accent" />
                  <span className="text-sm text-text-2">%</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div>
              <p className="text-sm font-semibold text-text-1">AI Follow-up Comments</p>
              <p className="text-xs text-text-3 mt-0.5">Post batched comments when more sessions hit the same issue</p>
            </div>
            <Toggle checked={followUp} onChange={() => setFollowUp(v => !v)} />
          </div>
        </div>
      </Section>

      <Section icon={FolderOpen} title="Project Details" description="General project attributes and naming config.">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-text-3 block mb-1.5">Project Name</label>
            <input defaultValue="Checkout App"
              className="w-full px-4 py-2.5 text-sm bg-surface border border-border rounded-xl
                         text-text-1 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-text-3 block mb-1.5">Project ID</label>
            <div className="px-4 py-2.5 text-sm font-mono bg-surface-2 border border-border rounded-xl text-text-3 select-all">
              proj_a1b2c3
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}
```

---

## STUB PAGES (build these last — Issues [id] and Sessions [id] are complex)

### app/issues/[id]/page.tsx

```tsx
import { mockIssues } from "@/lib/mock-data"
import { IssueBadge } from "@/components/ui/IssueBadge"
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge"
import { formatRelativeTime, formatTimestamp, severityColor } from "@/lib/utils"
import { Github, ArrowLeft, Users, Clock, ChevronRight } from "lucide-react"
import Link from "next/link"
import { mockSessions } from "@/lib/mock-data"

const eventTypeLabel: Record<string, string> = {
  navigation:    "Navigated to",
  click:         "Clicked",
  rage_click:    "Rage clicked",
  dead_click:    "Dead click on",
  network_error: "Network error",
  js_error:      "JS Error",
  console_error: "Console error",
}
const eventColor: Record<string, string> = {
  navigation:    "bg-accent-light border-accent/20 text-accent",
  click:         "bg-surface-2 border-border text-text-2",
  rage_click:    "bg-p2-bg border-yellow-200 text-p2",
  dead_click:    "bg-surface-2 border-border text-text-3",
  network_error: "bg-p0-bg border-red-200 text-p0",
  js_error:      "bg-p1-bg border-orange-200 text-p1",
  console_error: "bg-surface-2 border-border text-text-3",
}

export default async function IssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const issue = mockIssues.find(i => i.id === id) ?? mockIssues[0]
  const c = severityColor(issue.severity)
  const affectedSessions = mockSessions.filter(s => s.issue_instance_count > 0).slice(0, 5)

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <Link href="/issues" className="inline-flex items-center gap-1.5 text-sm text-text-3
                                      hover:text-accent transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to Issues
      </Link>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">

        {/* Left — AI report */}
        <div className="space-y-5">
          <div className={`bg-surface rounded-2xl border border-border shadow-sm overflow-hidden`}>
            <div className={`h-1 w-full ${c.dot}`} />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <IssueBadge severity={issue.severity} />
                <ConfidenceBadge value={issue.confidence} />
                {issue.github_auto_raised && (
                  <span className="text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                    auto-raised
                  </span>
                )}
                <span className="ml-auto text-xs text-text-3 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Last seen {formatRelativeTime(issue.last_seen_at)}
                </span>
              </div>
              <h1 className="text-xl font-bold text-text-1 leading-snug">{issue.title}</h1>
              <div className="flex items-center gap-5 mt-3 text-xs text-text-3">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  {issue.affected_session_count} sessions affected
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  First seen {formatRelativeTime(issue.first_seen_at)}
                </span>
              </div>
            </div>

            <div className="border-t border-border divide-y divide-border">
              {[
                { label: "Root Cause",      content: issue.root_cause     },
                { label: "Suggested Fix",   content: issue.suggested_fix  },
              ].map(({ label, content }) => (
                <div key={label} className="p-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2">{label}</p>
                  <p className="text-sm text-text-2 leading-relaxed">{content}</p>
                </div>
              ))}

              <div className="p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-3">Reproduction Steps</p>
                <ol className="space-y-2.5">
                  {issue.reproduction_steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-text-2">
                      <span className="w-6 h-6 rounded-full bg-accent-light text-accent text-xs font-bold
                                       flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-3">Evidence Timeline</p>
                <div className="space-y-3">
                  {issue.evidence.map((ev, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium border ${eventColor[ev.type] ?? eventColor.click} shrink-0`}>
                        {eventTypeLabel[ev.type] ?? ev.type}
                      </span>
                      <span className="text-sm text-text-1 flex-1">{ev.detail}</span>
                      <span className="font-mono text-xs text-text-3 bg-surface-2 border border-border px-1.5 py-0.5 rounded shrink-0">
                        {formatTimestamp(ev.timestamp_ms)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Affected sessions */}
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <p className="text-sm font-semibold text-text-1">Affected Sessions</p>
            </div>
            <div className="divide-y divide-border">
              {affectedSessions.map(s => (
                <Link key={s.id} href={`/sessions/${s.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors group">
                  <span className="font-mono text-xs text-text-3 w-28 shrink-0">{s.id}</span>
                  <span className="text-xs text-text-2 flex-1 truncate">{s.url}</span>
                  <span className={`text-xs font-medium ${s.ai_goal_completed ? "text-ok" : "text-p0"}`}>
                    {s.ai_goal_completed ? "✓ Goal Met" : "✕ Failed"}
                  </span>
                  <span className="text-xs text-text-3 w-14 text-right">{formatRelativeTime(s.started_at)}</span>
                  <ChevronRight className="w-4 h-4 text-text-3 group-hover:text-accent transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right — action panel */}
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Github className="w-4 h-4 text-text-2" />
              <p className="text-sm font-semibold text-text-1">GitHub</p>
            </div>
            {issue.github_issue_url ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-surface-2 rounded-xl border border-border">
                  <Github className="w-4 h-4 text-text-2" />
                  <span className="text-sm text-text-1 font-medium">
                    acme/checkout-app #{issue.github_issue_number}
                  </span>
                  <span className="ml-auto text-xs font-medium text-ok bg-ok-bg border border-green-200 px-2 py-0.5 rounded-full">
                    open
                  </span>
                </div>
                <a href={issue.github_issue_url} target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium
                             text-text-2 bg-surface-2 border border-border rounded-xl
                             hover:border-accent/40 hover:text-accent transition-all">
                  View on GitHub
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                <button className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold
                                   text-white bg-accent hover:bg-accent-dark rounded-xl transition-colors">
                  <Github className="w-4 h-4" />
                  Raise GitHub Issue
                </button>
                <textarea placeholder="Add a comment before raising..." rows={3}
                  className="w-full text-sm bg-surface-2 border border-border rounded-xl p-3 resize-none
                             text-text-1 placeholder:text-text-3 focus:outline-none focus:ring-2
                             focus:ring-accent/30 focus:border-accent transition-all" />
              </div>
            )}
          </div>

          <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-3">Session Stats</p>
            <div className="space-y-2.5">
              {[
                { label: "Affected sessions", value: issue.affected_session_count },
                { label: "Avg confidence",    value: `${Math.round(issue.confidence * 100)}%` },
                { label: "First seen",        value: formatRelativeTime(issue.first_seen_at) },
                { label: "Last seen",         value: formatRelativeTime(issue.last_seen_at) },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-text-3">{label}</span>
                  <span className="text-xs font-semibold text-text-1 font-mono">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

### app/sessions/[id]/page.tsx

```tsx
import { mockSessions, mockIssues } from "@/lib/mock-data"
import { IssueBadge } from "@/components/ui/IssueBadge"
import { FrictionBar } from "@/components/ui/FrictionBar"
import { EnvironmentChip } from "@/components/ui/EnvironmentChip"
import { formatRelativeTime, formatDuration, formatTimestamp } from "@/lib/utils"
import { ArrowLeft, Play, MonitorPlay, GitBranch } from "lucide-react"
import Link from "next/link"

const eventTypeLabel: Record<string, string> = {
  navigation:    "Navigated to",
  click:         "Clicked",
  rage_click:    "Rage clicked",
  dead_click:    "Dead click on",
  network_error: "Network error",
  js_error:      "JS Error",
  console_error: "Console error",
}
const eventColor: Record<string, string> = {
  navigation:    "bg-accent-light border-accent/20 text-accent",
  click:         "bg-surface-2 border-border text-text-2",
  rage_click:    "bg-p2-bg border-yellow-200 text-p2",
  dead_click:    "bg-surface-2 border-border text-text-3",
  network_error: "bg-p0-bg border-red-200 text-p0",
  js_error:      "bg-p1-bg border-orange-200 text-p1",
  console_error: "bg-surface-2 border-border text-text-3",
}

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = mockSessions.find(s => s.id === id) ?? mockSessions[0]
  const linkedIssues = mockIssues.filter(i => i.affected_session_count > 0).slice(0, 2)

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <Link href="/sessions" className="inline-flex items-center gap-1.5 text-sm text-text-3
                                        hover:text-accent transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to Sessions
      </Link>

      {/* Replay player */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden mb-6">
        <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-2 border-b border-border">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-400" />
            <span className="w-3 h-3 rounded-full bg-yellow-400" />
            <span className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 bg-surface border border-border rounded-md px-3 py-1 text-xs font-mono text-text-3">
            https://example.com{session.url}
          </div>
          <span className="text-xs font-mono text-text-3">{session.screen_width}×{session.screen_height}</span>
        </div>

        {/* Viewport */}
        <div className="aspect-video bg-slate-50 relative overflow-hidden flex items-center justify-center">
          <div className="w-full h-full p-8 space-y-4 opacity-40">
            <div className="h-6 w-40 bg-slate-200 rounded" />
            <div className="grid grid-cols-3 gap-4">
              <div className="h-32 bg-slate-200 rounded-lg" />
              <div className="h-32 bg-slate-200 rounded-lg" />
              <div className="h-32 bg-slate-200 rounded-lg" />
            </div>
            <div className="h-10 w-32 bg-slate-300 rounded-lg" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-text-3">
              <MonitorPlay className="w-10 h-10" />
              <p className="text-sm font-medium">Session replay will render here</p>
              <p className="text-xs">rrweb-player · {formatDuration(session.duration_ms)}</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="px-4 py-3 bg-surface-2 border-t border-border">
          <div className="flex items-center gap-3 mb-2.5">
            <button className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center hover:bg-accent-dark transition-colors">
              <Play className="w-4 h-4 ml-0.5" />
            </button>
            <span className="font-mono text-xs text-text-3">0:00 / {formatDuration(session.duration_ms)}</span>
            <select className="ml-auto text-xs bg-surface border border-border rounded-lg px-2 py-1 text-text-2">
              <option>1×</option><option>2×</option><option>0.5×</option>
            </select>
          </div>
          {/* Scrubber */}
          <div className="relative h-2 bg-surface-2 rounded-full border border-border overflow-hidden">
            <div className="absolute left-0 top-0 h-full w-[8%] bg-accent rounded-full" />
            {session.timeline
              .filter(e => e.type === "network_error" || e.type === "js_error" || e.type === "rage_click")
              .map((ev, i) => (
                <div key={i}
                  className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm
                    ${ev.type === "network_error" || ev.type === "js_error" ? "bg-p0" : "bg-p2"}`}
                  style={{ left: `${Math.min((ev.timestamp_ms / session.duration_ms) * 100, 95)}%` }}
                  title={ev.type}
                />
              ))}
          </div>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">

        {/* AI Analysis */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-accent-light flex items-center justify-center">
              <span className="text-accent text-xs font-bold">✦</span>
            </div>
            <p className="text-sm font-semibold text-text-1">AI Session Analysis</p>
          </div>
          <p className="text-sm text-text-2 leading-relaxed mb-5">{session.ai_session_summary}</p>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-surface-2 rounded-xl border border-border p-4">
              <p className="text-xs text-text-3 mb-1">Friction Score</p>
              <FrictionBar score={session.ai_friction_score} />
            </div>
            <div className="bg-surface-2 rounded-xl border border-border p-4">
              <p className="text-xs text-text-3 mb-1">Goal Completion</p>
              <p className={`text-sm font-semibold ${session.ai_goal_completed ? "text-ok" : "text-p0"}`}>
                {session.ai_goal_completed ? "✓ Goal Met" : "✕ Goal Failed"}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            {[
              { label: "Release",     value: session.release, icon: null },
              { label: "Commit",      value: session.commit_sha, mono: true },
              { label: "Duration",    value: formatDuration(session.duration_ms) },
              { label: "Started",     value: formatRelativeTime(session.started_at) },
              { label: "Environment", value: session.environment },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-xs text-text-3">{label}</span>
                <span className={`text-xs font-semibold text-text-1 ${mono ? "font-mono" : ""}`}>{value}</span>
              </div>
            ))}
          </div>

          {linkedIssues.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2.5">Linked Issues</p>
              <div className="space-y-2">
                {linkedIssues.map(issue => (
                  <Link key={issue.id} href={`/issues/${issue.id}`}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border
                               hover:border-accent/30 hover:bg-surface-2 transition-all group">
                    <IssueBadge severity={issue.severity} />
                    <span className="text-xs text-text-1 flex-1 truncate group-hover:text-accent transition-colors">
                      {issue.title}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Event timeline */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <p className="text-sm font-semibold text-text-1">Event Timeline</p>
          </div>
          <div className="divide-y divide-border overflow-y-auto max-h-[480px]">
            {session.timeline.map((ev, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium border
                                  shrink-0 ${eventColor[ev.type] ?? eventColor.click}`}>
                  {eventTypeLabel[ev.type] ?? ev.type}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-1 leading-relaxed">
                    {ev.nav_to ?? ev.target ?? ev.network_url ?? ev.error_message ?? ""}
                    {ev.network_status && (
                      <span className="ml-1 font-mono font-bold text-p0">→ {ev.network_status}</span>
                    )}
                    {ev.click_count && (
                      <span className="ml-1 text-p2 font-semibold">×{ev.click_count}</span>
                    )}
                  </p>
                </div>
                <span className="font-mono text-xs text-text-3 bg-surface-2 border border-border
                                 px-1.5 py-0.5 rounded shrink-0">
                  {formatTimestamp(ev.timestamp_ms)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## FINAL CHECKLIST FOR ANTI GRAVITY

Before calling this done, verify every item:

- [ ] `globals.css` has `@import "tailwindcss"` at the top — NOT `@tailwind base/components/utilities`
- [ ] No `tailwind.config.ts` file exists anywhere
- [ ] `layout.tsx` imports `GeistSans` and `GeistMono` from `geist/font/sans` and `geist/font/mono`
- [ ] `layout.tsx` applies `${GeistSans.variable} ${GeistMono.variable}` to the `<html>` tag
- [ ] `layout.tsx` body has `flex h-screen overflow-hidden` so sidebar + main sit side by side
- [ ] `lib/mock-data.ts` is the ONLY place with hardcoded data — no inline mock values in pages
- [ ] All pages are Server Components by default — only add `"use client"` where useState/useEffect is used
- [ ] Every page wraps content in `<div className="p-6 max-w-[1400px] mx-auto">`
- [ ] Run `rm -rf .next && pnpm dev` after all files are written
