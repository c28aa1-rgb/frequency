import type { NextConfig } from "next";
import path from "node:path";

// Static export so the site can be hosted on GitHub Pages. There's no Next.js
// server: auth runs in the browser against Supabase, TURN credentials come from
// a Supabase Edge Function, and image cleanup runs as a GitHub Action.
// NEXT_PUBLIC_BASE_PATH is "/frequency" on Pages and empty locally.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  // Emit /chats/index.html etc. so GitHub Pages serves clean URLs.
  trailingSlash: true,
  images: { unoptimized: true },
  // Pin the workspace root to this folder. A stray lockfile higher up the
  // tree (C:\Users\Rami-2) was making Turbopack guess the wrong root.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Hide the dev-mode indicator badge (it never renders in production anyway).
  devIndicators: false,
  // Allow the LAN IP and Cloudflare quick-tunnel domains to load dev resources
  // (HMR, JS chunks) when testing from another device.
  allowedDevOrigins: ["192.168.2.134", "*.trycloudflare.com"],
};

export default nextConfig;
