
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    console.error("[EMSMS SERVER ENV CHECK]", {
      urlPresent: Boolean(url),
      publishableKeyPresent: Boolean(key),
    });

    throw new Error(
      "Supabase URL or publishable key is missing. Check .env.local in the project root and restart Next.js."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Cookie updates may be unavailable in Server Components.
          // Middleware or a Route Handler can refresh the session.
        }
      },
    },
  });
}
