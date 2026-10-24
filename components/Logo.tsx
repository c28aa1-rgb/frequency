// Brand mark: concentric signal rings broadcasting from a single point —
// "one channel for one school."
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="3.2" fill="var(--color-signal)" />
      <path d="M22 16a6 6 0 0 0-6-6" stroke="var(--color-signal)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M27 16a11 11 0 0 0-11-11" stroke="var(--color-signal)" strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
      <path d="M10 16a6 6 0 0 1 6-6" stroke="var(--color-live)" strokeWidth="2.4" strokeLinecap="round" transform="rotate(180 16 16)" />
      <path d="M5 16a11 11 0 0 1 11-11" stroke="var(--color-live)" strokeWidth="2.4" strokeLinecap="round" transform="rotate(180 16 16)" opacity="0.55" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo />
      <span className="font-display text-[1.35rem] font-extrabold tracking-tight text-ink">
        Frequency
      </span>
    </div>
  );
}
