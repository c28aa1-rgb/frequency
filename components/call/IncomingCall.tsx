"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Person } from "@/lib/mock";
import { Avatar } from "@/components/Avatar";
import { Phone, Close, Message, Minimize, Send } from "@/components/icons";

const QUICK_REPLIES = [
  "Can't talk right now",
  "Call you back in a bit",
  "On my way",
];

const spring = { type: "spring" as const, stiffness: 380, damping: 30 };

// Silent, visual-only incoming-call overlay (no audio ringtone — school setting).
export function IncomingCall({
  person,
  onAccept,
  onDecline,
  onMinimize,
  onMessage,
}: {
  person: Person;
  onAccept: () => void;
  onDecline: () => void;
  onMinimize: () => void;
  onMessage: (text?: string) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-console/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="relative w-[360px] rounded-[22px] border border-white/10 bg-console-soft p-7 text-center text-white shadow-2xl"
        initial={{ opacity: 0, scale: 0.9, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.6, y: 80, x: 120 }}
        transition={spring}
      >
        <button
          onClick={onMinimize}
          title="Minimize"
          aria-label="Minimize call"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
        >
          <Minimize className="h-4 w-4" />
        </button>

        <motion.p layout className="u-label mb-6 text-live">
          <motion.span
            className="inline-block h-1.5 w-1.5 rounded-full bg-live align-middle"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />{" "}
          Incoming call · silent
        </motion.p>
        <motion.div layout className="mb-5 flex justify-center">
          <Avatar initials={person.initials} color={person.color} size="xl" />
        </motion.div>
        <motion.h2 layout className="font-display text-2xl font-bold">
          {person.name}
        </motion.h2>
        <motion.p layout className="mt-1 font-mono text-xs text-white/50">
          {person.email}
        </motion.p>

        <AnimatePresence mode="wait" initial={false}>
          {replying ? (
            <motion.div
              key="reply"
              className="mt-7 text-left"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
            >
              <div className="mb-3 flex flex-wrap gap-2">
                {QUICK_REPLIES.map((r) => (
                  <motion.button
                    key={r}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onMessage(r)}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10"
                  >
                    {r}
                  </motion.button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onMessage(draft.trim() || undefined);
                }}
                className="flex items-center gap-2"
              >
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Message ${person.name.split(" ")[0]}…`}
                  className="h-11 flex-1 rounded-full border border-white/15 bg-console px-4 text-sm text-white outline-none placeholder:text-white/40 focus:border-signal"
                />
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.9 }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-signal text-white hover:brightness-110"
                  title="Send & open chat"
                >
                  <Send className="h-5 w-5" />
                </motion.button>
              </form>
              <button
                onClick={() => setReplying(false)}
                className="mt-4 w-full text-center font-mono text-xs text-white/50 hover:text-white"
              >
                ← back to call
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="actions"
              className="mt-8 flex items-center justify-center gap-7"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
            >
              <CallAction label="Decline" tone="alert" onClick={onDecline}>
                <Close className="h-6 w-6" />
              </CallAction>
              <CallAction label="Message" tone="neutral" onClick={() => setReplying(true)}>
                <Message className="h-6 w-6" />
              </CallAction>
              <CallAction label="Accept" tone="live" onClick={onAccept}>
                <Phone className="h-6 w-6" />
              </CallAction>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function CallAction({
  children,
  label,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  tone: "alert" | "live" | "neutral";
  onClick: () => void;
}) {
  const bg =
    tone === "alert" ? "bg-alert" : tone === "live" ? "bg-live" : "bg-white/15 hover:bg-white/25";
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2">
      <motion.span
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.9 }}
        className={`flex h-14 w-14 items-center justify-center rounded-full ${bg}`}
      >
        {children}
      </motion.span>
      <span className="u-label text-white/60">{label}</span>
    </button>
  );
}
