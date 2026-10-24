"use client";

import { Logo } from "./Logo";

export function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-paper px-6 text-center">
      <div className="mb-5 opacity-80">
        <Logo size={56} />
      </div>
      <h2 className="font-display text-2xl font-bold text-ink">You&apos;re tuned in.</h2>
      <p className="mt-2 max-w-sm text-ink-soft">
        Pick someone on the left to start a conversation. Anyone with the
        <span className="font-mono"> green signal</span> has a tab open right now.
      </p>
    </div>
  );
}
