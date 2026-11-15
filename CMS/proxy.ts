
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase environment variables are missing. Check .env.local."
    );
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(
              name,
              value,
              options
            );
          });
        },
      },
    }
  );

  // Validate the user with Supabase.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // Block access when the session is invalid or missing.
  if (error || !user) {
    const loginUrl = new URL("/login", request.url);

    loginUrl.searchParams.set(
      "next",
      request.nextUrl.pathname
    );

    const redirectResponse =
      NextResponse.redirect(loginUrl);

    // Preserve any refreshed authentication cookies.
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });

    return redirectResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/complaints/:path*",
    "/service-requests/:path*",
    "/departments/:path*",
    "/reports/:path*",
    "/users/:path*",
    "/settings/:path*",
  ],
};
