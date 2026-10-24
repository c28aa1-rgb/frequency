"use client";

import { useRouter } from "next/navigation";
import { Wordmark } from "./Logo";
import { createClient } from "@/lib/supabase/client";

export function DisabledNotice() {
  const router = useRouter();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Wordmark />
      <h1 className="mt-4 font-display text-3xl font-extrabold text-ink">Your account is paused</h1>
      <p className="max-w-sm text-ink-soft">
        A moderator has disabled this account. If you think that&apos;s a mistake, talk to the
        person who runs Frequency at school.
      </p>
      <button
        onClick={async () => {
          await createClient().auth.signOut();
          router.push("/");
          router.refresh();
        }}
        className="mt-2 rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface"
      >
        Sign out
      </button>
    </main>
  );
}
