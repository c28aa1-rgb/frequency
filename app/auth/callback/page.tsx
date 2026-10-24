"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Google redirects here after sign-in. Exchange the code for a session (stored
// in the browser), then send the user on to the app.
function Callback() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const code = params.get("code");
    const next = params.get("next") ?? "/welcome";
    if (!code) {
      router.replace("/?error=signin-failed");
      return;
    }
    createClient()
      .auth.exchangeCodeForSession(code)
      .then(({ error }) => router.replace(error ? "/?error=signin-failed" : next));
  }, [params, router]);

  return null;
}

export default function AuthCallback() {
  return (
    <main className="flex min-h-screen items-center justify-center font-mono text-sm text-ink-soft">
      Signing you in…
      <Suspense>
        <Callback />
      </Suspense>
    </main>
  );
}
