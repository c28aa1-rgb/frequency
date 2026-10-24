import type { Presence } from "@/lib/mock";

const sizes = {
  sm: "h-8 w-8 text-[0.7rem]",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-24 w-24 text-3xl",
};

export function Avatar({
  initials,
  color,
  presence,
  size = "md",
  pulse = false,
}: {
  initials: string;
  color: string;
  presence?: Presence;
  size?: keyof typeof sizes;
  /** show the animated signal ring (only when online). Off by default. */
  pulse?: boolean;
}) {
  const online = presence === "online";
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={`${sizes[size]} relative inline-flex items-center justify-center rounded-full font-display font-bold text-white ${
          online && pulse ? "signal-ring" : ""
        }`}
        style={{ backgroundColor: color }}
      >
        {initials}
      </span>
      {presence && (
        <span
          className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface"
          style={{ backgroundColor: online ? "var(--color-live)" : "var(--color-line)" }}
          title={online ? "Tab open now" : "Tab closed"}
        />
      )}
    </span>
  );
}
