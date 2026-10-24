// Shimmer placeholder block. Sized via className (width/height) or style.
export function Skeleton({
  className = "",
  style,
  circle = false,
}: {
  className?: string;
  style?: React.CSSProperties;
  circle?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`skeleton block ${circle ? "rounded-full" : ""} ${className}`}
      style={style}
    />
  );
}

// A directory row placeholder (avatar + two text lines) for the sidebar.
export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton circle className="h-10 w-10 shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-2.5 w-3/4" />
      </div>
    </div>
  );
}

// A chat message placeholder; mirrors the bubble layout, alternating sides.
export function MessageSkeleton({ mine = false, w = 180 }: { mine?: boolean; w?: number }) {
  return (
    <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
      <div className="w-8 shrink-0">
        {!mine && <Skeleton circle className="h-8 w-8" />}
      </div>
      <Skeleton className="h-10" style={{ width: w, borderRadius: 16 }} />
    </div>
  );
}
