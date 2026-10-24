// Shared person/message shapes and small helpers used across the app.

export type Presence = "online" | "offline";

export type Person = {
  id: string;
  name: string;       // display name from Google
  email: string;
  initials: string;
  color: string;      // avatar color
  presence: Presence;
  pinned: boolean;
  blocked: boolean;   // blocked by me
  isDalton: boolean;
};

export type Message = {
  id: string;
  authorId: string;   // person id, or "me"
  kind: "text" | "image" | "missed-call";
  body?: string;
  imagePath?: string; // storage path in the chat-images bucket
  imageUrl?: string;  // signed (or local preview) URL for display
  sentAt: string;      // ISO
  expiresInHours: number; // 3-day retention countdown
};

export const AVATAR_COLORS = [
  "#3a66ff", "#7c5cff", "#15c26b", "#ff8a3d", "#ff5436",
  "#c2477f", "#00b3c4", "#9a6a00", "#5c79a8", "#ffc247",
];

// Deterministic avatar color from a stable seed (user id), so people without a
// chosen color still get a consistent one.
export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/gi, "")) // drop punctuation like "(lab"
    .filter(Boolean);
  return words.map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
}
