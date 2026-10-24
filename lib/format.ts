export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

// 3-day retention countdown, shown in the mono utility face
export function expiryLabel(hours: number): string {
  if (hours <= 0) return "gone";
  if (hours < 1) return "<1h left";
  if (hours < 24) return `${Math.round(hours)}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

export function isExpiring(hours: number): boolean {
  return hours <= 6;
}
