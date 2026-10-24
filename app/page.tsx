"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignInButton } from "@/components/SignInButton";
import { createClient } from "@/lib/supabase/client";

export default function SignIn() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  // Already signed in? Skip straight into the app.
  useEffect(() => {
    setFailed(new URLSearchParams(window.location.search).get("error") === "signin-failed");
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace("/welcome");
      });
  }, [router]);

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      {/* ambient broadcast rings */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[42%] -z-10 -translate-x-1/2 -translate-y-1/2">
        {[260, 460, 680, 920].map((d, i) => (
          <span
            key={d}
            className="absolute rounded-full border"
            style={{
              width: d,
              height: d,
              left: -d / 2,
              top: -d / 2,
              borderColor: "var(--color-signal)",
              opacity: 0.16 - i * 0.03,
            }}
          />
        ))}
      </div>

      <header className="flex items-center justify-between px-10 py-7">
        <Wordmark />
        <div className="flex items-center gap-3">
          <span className="u-label text-ink-soft">Dalton only</span>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="u-label mb-6 rounded-full border border-line bg-surface px-3.5 py-1.5 text-signal-ink">
          ● Dalton, connected automatically
        </p>

        <h1 className="max-w-3xl font-display text-6xl font-extrabold leading-[1.02] tracking-tight text-ink">
          The whole school,
          <br />
          on one frequency.
        </h1>

        <p className="mt-6 max-w-md text-lg leading-7 text-ink-soft">
          Sign in with Google. Everyone with a Dalton account is connected
          automatically — message and call, no friend requests.
        </p>

        <SignInButton />
        {failed && (
          <p className="mt-3 text-sm text-alert">Sign-in didn&apos;t finish — please try again.</p>
        )}

        <div className="mt-14 flex flex-wrap items-center justify-center gap-2.5">
          {[
            "Messages clear after 3 days",
            "Calls ring silently",
            "Reported & auto-moderated",
          ].map((t) => (
            <span
              key={t}
              className="rounded-full border border-line bg-surface/70 px-4 py-2 text-sm text-ink-soft"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <footer className="px-10 py-6 text-center font-mono text-xs text-ink-soft">
        Built for school MacBooks · Chrome · v1 preview
      </footer>
    </main>
  );
}
