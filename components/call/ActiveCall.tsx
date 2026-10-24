"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Person } from "@/lib/mock";
import { initialsOf } from "@/lib/mock";
import { Avatar } from "@/components/Avatar";
import { useDirectory } from "@/components/DirectoryProvider";
import { Mic, MicOff, Video, VideoOff, Phone, Expand, Flag } from "@/components/icons";

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex h-5 items-center gap-[3px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full bg-live ${active ? "wave-bar" : ""}`}
          style={{ height: "100%", animationDelay: `${i * 0.12}s`, opacity: active ? 1 : 0.25 }}
        />
      ))}
    </div>
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

type Props = {
  person: Person;
  connected: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  camOff: boolean;
  onToggleMute: () => void;
  onToggleCam: () => void;
  onEnd: () => void;
};

// Dark, cinematic in-call view. "Pop out" morphs it into a corner PiP card
// (and back) via a shared layoutId — mimics the auto-PiP behaviour.
export function ActiveCall({
  person,
  connected,
  localStream,
  remoteStream,
  muted,
  camOff,
  onToggleMute,
  onToggleCam,
  onEnd,
}: Props) {
  const { me } = useDirectory();
  const [secs, setSecs] = useState(0);
  const [popped, setPopped] = useState(false);

  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);

  // Only count once the callee has answered.
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [connected]);

  // Attach streams to the <video> elements. `popped` is a dep because the
  // element unmounts/remounts when toggling between full and PiP views.
  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream;
  }, [remoteStream, popped]);
  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = localStream;
  }, [localStream, popped]);

  const hasRemote = !!remoteStream;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {popped ? (
        <motion.div
          key="pip"
          initial={{ opacity: 0, scale: 0.85, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 20 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-5 right-5 z-50 w-64 overflow-hidden rounded-2xl border border-white/10 bg-console shadow-2xl"
        >
          <div
            className="relative flex h-36 items-center justify-center"
            style={{ background: `radial-gradient(120% 120% at 50% 0%, ${person.color}33, var(--color-console))` }}
          >
            <video
              ref={remoteRef}
              autoPlay
              playsInline
              className={`absolute inset-0 h-full w-full object-cover ${hasRemote ? "" : "hidden"}`}
            />
            {!hasRemote && <Avatar initials={person.initials} color={person.color} size="lg" />}
            <span className="u-label absolute left-3 top-3 z-10 text-live">
              {connected ? `● live · ${fmt(secs)}` : "● calling…"}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="truncate text-sm font-medium text-white">{person.name}</span>
            <div className="flex items-center gap-1.5">
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => setPopped(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                title="Back to call"
              >
                <Expand className="h-4 w-4" />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={onEnd}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-alert text-white hover:brightness-110"
                title="End call"
              >
                <Phone className="h-4 w-4 rotate-[135deg]" />
              </motion.button>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="full"
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex flex-col bg-console text-white"
        >
          {/* top bar */}
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <Waveform active={connected && !muted} />
              <div>
                <p className="font-display font-bold leading-tight">{person.name}</p>
                <p className="font-mono text-xs text-white/50">
                  {connected ? `live · ${fmt(secs)}` : "calling…"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => alert("Report sent to a moderator. The call stays up.")}
                className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
              >
                <Flag className="h-4 w-4" /> Report
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => setPopped(true)}
                className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
              >
                <Expand className="h-4 w-4" /> Pop out
              </motion.button>
            </div>
          </div>

          {/* remote stage */}
          <div className="relative flex flex-1 items-center justify-center px-6">
            <div
              className="relative flex aspect-video w-full max-w-4xl items-center justify-center overflow-hidden rounded-3xl border border-white/10"
              style={{ background: `radial-gradient(120% 120% at 50% 10%, ${person.color}44, var(--color-console-soft))` }}
            >
              <video
                ref={remoteRef}
                autoPlay
                playsInline
                className={`absolute inset-0 h-full w-full object-cover ${hasRemote ? "" : "hidden"}`}
              />
              {!hasRemote && (
                <div className="text-center">
                  <Avatar initials={person.initials} color={person.color} size="xl" />
                  <p className="mt-4 font-mono text-sm text-white/60">
                    {connected ? "waiting for video…" : "ringing…"}
                  </p>
                </div>
              )}

              {/* self tile (PiP within the call) */}
              <div className="absolute bottom-4 right-4 flex aspect-video w-44 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-console-soft">
                <video
                  ref={localRef}
                  autoPlay
                  playsInline
                  muted
                  className={`h-full w-full object-cover ${localStream && !camOff ? "" : "hidden"}`}
                />
                {(!localStream || camOff) && (
                  <div className="text-center">
                    <Avatar initials={initialsOf(me?.name ?? "You")} color={me?.color ?? "#3a66ff"} size="md" />
                    <p className="mt-2 u-label text-white/40">{camOff ? "camera off" : "you"}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* controls */}
          <div className="flex items-center justify-center gap-4 py-7">
            <CtrlButton on={!muted} active={<Mic className="h-5 w-5" />} off={<MicOff className="h-5 w-5" />} onClick={onToggleMute} />
            <CtrlButton on={!camOff} active={<Video className="h-5 w-5" />} off={<VideoOff className="h-5 w-5" />} onClick={onToggleCam} />
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.92 }}
              onClick={onEnd}
              className="flex h-14 w-20 items-center justify-center rounded-full bg-alert"
              title="End call"
            >
              <Phone className="h-6 w-6 rotate-[135deg]" />
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CtrlButton({
  on,
  active,
  off,
  onClick,
}: {
  on: boolean;
  active: React.ReactNode;
  off: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
        on ? "bg-white/10 text-white hover:bg-white/20" : "bg-white text-console"
      }`}
    >
      {on ? active : off}
    </motion.button>
  );
}
