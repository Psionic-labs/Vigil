import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Check for the presence of the session token cookie (either HTTP or HTTPS Secure variant)
  const sessionToken =
    request.cookies.get("better-auth.session_token") ||
    request.cookies.get("__Secure-better-auth.session_token");
  const { pathname } = request.nextUrl;

  const isAuthPage = pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");

  // Client-side UX Protection: Redirect to sign-in if missing session
  // (Strict security and authorization are validated at the backend API layer)
  if (!sessionToken && !isAuthPage) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  // Redirect authenticated users away from sign-in/sign-up pages
  if (sessionToken && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static file resources)
     * - _next/image (Next.js image optimization)
     * - favicon.ico (site favicon)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
