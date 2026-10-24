// Minimal, consistent 1.6px stroke icon set.
type P = { className?: string };
const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const Search = (p: P) => (
  <svg {...base} className={p.className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
);
export const Phone = (p: P) => (
  <svg {...base} className={p.className}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" /></svg>
);
export const Video = (p: P) => (
  <svg {...base} className={p.className}><path d="m23 7-7 5 7 5V7Z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
);
export const VideoOff = (p: P) => (
  <svg {...base} className={p.className}><path d="M16 16v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2m4 0h4a2 2 0 0 1 2 2v2l4-3v10M2 2l20 20" /></svg>
);
export const MicOff = (p: P) => (
  <svg {...base} className={p.className}><path d="M2 2l20 20M9 9v3a3 3 0 0 0 5 2.2M15 9.3V5a3 3 0 0 0-5.7-1.3M19 10v2a7 7 0 0 1-.6 2.8M12 19v3M8 22h8" /></svg>
);
export const Mic = (p: P) => (
  <svg {...base} className={p.className}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" /></svg>
);
export const Pin = (p: P) => (
  <svg {...base} className={p.className}><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6ZM12 18v3" /></svg>
);
export const Send = (p: P) => (
  <svg {...base} className={p.className}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" /></svg>
);
export const ImageIcon = (p: P) => (
  <svg {...base} className={p.className}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="m21 15-5-5L5 21" /></svg>
);
export const Block = (p: P) => (
  <svg {...base} className={p.className}><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg>
);
export const Flag = (p: P) => (
  <svg {...base} className={p.className}><path d="M4 21V4M4 4h13l-2 4 2 4H4" /></svg>
);
export const Close = (p: P) => (
  <svg {...base} className={p.className}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const Shield = (p: P) => (
  <svg {...base} className={p.className}><path d="M12 3 5 6v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const Expand = (p: P) => (
  <svg {...base} className={p.className}><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3" /></svg>
);
export const Logout = (p: P) => (
  <svg {...base} className={p.className}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
);
export const Message = (p: P) => (
  <svg {...base} className={p.className}><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.8L3 21l1.9-4.1A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z" /></svg>
);
export const Minimize = (p: P) => (
  <svg {...base} className={p.className}><path d="M6 9l6 6 6-6" /></svg>
);
export const Bell = (p: P) => (
  <svg {...base} className={p.className}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
);
export const Check = (p: P) => (
  <svg {...base} className={p.className}><path d="M20 6 9 17l-5-5" /></svg>
);
export const Users = (p: P) => (
  <svg {...base} className={p.className}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.2A6.5 6.5 0 0 1 21.5 20" /></svg>
);
