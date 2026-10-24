"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Wordmark } from "@/components/Logo";
import { Bell, Video, Expand, Check, Close } from "@/components/icons";
import { session } from "@/lib/session";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "granted" | "denied";

type Channel = {
  id: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  /** null = nothing to prompt; treated as ready automatically */
  request: (() => Promise<boolean>) | null;
};

const channels: Channel[] = [
  {
    id: "notifications",
    title: "Notifications",
    desc: "Know when someone's calling, even on another tab.",
    icon: <Bell className="h-5 w-5" />,
    request: async () => {
      if (!("Notification" in window)) return false;
      return (await Notification.requestPermission()) === "granted";
    },
  },
  {
    id: "camera",
    title: "Camera & microphone",
    desc: "So friends can see and hear you on calls.",
    icon: <Video className="h-5 w-5" />,
    request: async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        s.getTracks().forEach((t) => t.stop()); // release immediately
        return true;
      } catch {
        return false;
      }
    },
  },
  {
    id: "pip",
    title: "Picture-in-picture",
    desc: "Float a call into a corner while you do other things.",
    icon: <Expand className="h-5 w-5" />,
    request: null, // no prompt needed — Chrome enables this automatically
  },
];

export default function Welcome() {
  const router = useRouter();
  const [status, setStatus] = useState<Record<string, Status>>({ pip: "granted" });
  const [busy, setBusy] = useState<string | null>(null);

  // Require a session; skip onboarding for returning users.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/");
      else if (session.isOnboarded()) router.replace("/chats");
    });
  }, [router]);

  async function enable(c: Channel) {
    if (!c.request) return;
    setBusy(c.id);
    const ok = await c.request();
    setStatus((s) => ({ ...s, [c.id]: ok ? "granted" : "denied" }));
    setBusy(null);
  }

  async function enableAll() {
    for (const c of channels) {
      if (c.request && status[c.id] !== "granted") await enable(c);
    }
  }

  function finish() {
    session.setOnboarded();
    router.push("/chats");
  }

  const readyCount = channels.filter((c) => status[c.id] === "granted").length;

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-10">
      {/* ambient broadcast rings */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2">
        {[320, 560, 820].map((d, i) => (
          <span
            key={d}
            className="absolute rounded-full border"
            style={{ width: d, height: d, left: -d / 2, top: -d / 2, borderColor: "var(--color-signal)", opacity: 0.12 - i * 0.03 }}
          />
        ))}
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Wordmark />
          <p className="u-label mt-6 text-signal-ink">One-time setup</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight text-ink">
            Let&apos;s tune you in
          </h1>
          <p className="mt-2 text-ink-soft">
            Switch on what Frequency needs to call and notify you. You can change
            any of these later in Chrome.
          </p>
        </div>

        <div className="space-y-2.5">
          {channels.map((c) => {
            const st = status[c.id] ?? "idle";
            const auto = !c.request;
            return (
              <div
                key={c.id}
                className="flex items-center gap-3.5 rounded-card border border-line bg-surface p-4"
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: st === "granted" ? "var(--color-live)" : "var(--color-paper)",
                    color: st === "granted" ? "#fff" : "var(--color-signal-ink)",
                  }}
                >
                  {c.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{c.title}</p>
                  <p className="text-xs leading-snug text-ink-soft">{c.desc}</p>
                </div>
                <div className="shrink-0">
                  {st === "granted" ? (
                    <motion.span
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 24 }}
                      className="flex items-center gap-1 font-mono text-xs text-live"
                    >
                      <Check className="h-4 w-4" /> {auto ? "Ready" : "On"}
                    </motion.span>
                  ) : st === "denied" ? (
                    <button
                      onClick={() => enable(c)}
                      className="flex items-center gap-1 rounded-full bg-alert/10 px-3 py-1.5 text-xs font-medium text-alert hover:bg-alert/20"
                    >
                      <Close className="h-3.5 w-3.5" /> Retry
                    </button>
                  ) : (
                    <motion.button
                      whileTap={{ scale: 0.94 }}
                      onClick={() => enable(c)}
                      disabled={busy === c.id}
                      className="rounded-full bg-signal px-4 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
                    >
                      {busy === c.id ? "Waiting…" : "Allow"}
                    </motion.button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* denied hint */}
        {channels.some((c) => status[c.id] === "denied") && (
          <p className="mt-3 text-center font-mono text-[0.7rem] leading-relaxed text-ink-soft">
            Blocked something by accident? Click the 🔒/camera icon in Chrome&apos;s
            address bar to allow it.
          </p>
        )}

        <div className="mt-7 flex flex-col items-center gap-3">
          <button
            onClick={finish}
            className="w-full rounded-full bg-live py-3 text-sm font-semibold text-white hover:brightness-110"
          >
            Continue to Frequency
          </button>
          <div className="flex items-center gap-4 font-mono text-xs">
            <button onClick={enableAll} className="text-signal-ink hover:underline">
              Allow all
            </button>
            <span className="text-ink-soft">·</span>
            <span className="text-ink-soft">{readyCount} of {channels.length} ready</span>
          </div>
        </div>
      </div>
    </main>
  );
}
