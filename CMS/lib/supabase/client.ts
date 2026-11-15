
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    console.error("[EMSMS ENV CHECK]", {
      urlPresent: Boolean(url),
      publishableKeyPresent: Boolean(key),
    });

    throw new Error(
      `Supabase configuration missing: ${
        !url && !key
          ? "URL and publishable key"
          : !url
            ? "URL"
            : "publishable key"
      }. Check the project root .env.local file.`
    );
  }

  return createBrowserClient(url, key);
}
