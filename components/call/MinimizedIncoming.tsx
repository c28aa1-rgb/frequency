"use client";

import { motion } from "motion/react";
import type { Person } from "@/lib/mock";
import { Avatar } from "@/components/Avatar";
import { Phone, Close } from "@/components/icons";

const spring = { type: "spring" as const, stiffness: 420, damping: 32 };

// Collapsed incoming call: a clean rounded bar in the bottom-right with the
// caller's icon plus hang-up and accept. Click the caller to expand again.
export function MinimizedIncoming({
  person,
  onAccept,
  onDecline,
  onExpand,
}: {
  person: Person;
  onAccept: () => void;
  onDecline: () => void;
  onExpand: () => void;
}) {
  return (
    <motion.div
      className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-full border border-white/10 bg-console-soft py-2 pl-2.5 pr-3 text-white shadow-2xl"
      initial={{ opacity: 0, scale: 0.7, y: 28 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.7, y: 28 }}
      transition={spring}
    >
      <button
        onClick={onExpand}
        className="flex items-center gap-2.5 rounded-full pr-1 text-left hover:opacity-90"
        title="Expand call"
      >
        <Avatar initials={person.initials} color={person.color} size="md" presence="online" />
        <span className="leading-tight">
          <span className="block max-w-[120px] truncate text-sm font-semibold">{person.name}</span>
          <span className="u-label text-live">calling · silent</span>
        </span>
      </button>

      <div className="flex items-center gap-1.5">
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.9 }}
          onClick={onDecline}
          title="Decline"
          aria-label="Decline call"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-alert"
        >
          <Close className="h-4 w-4" />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.9 }}
          onClick={onAccept}
          title="Accept"
          aria-label="Accept call"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-live"
        >
          <Phone className="h-4 w-4" />
        </motion.button>
      </div>
    </motion.div>
  );
}
