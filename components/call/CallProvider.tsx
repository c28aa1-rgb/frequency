"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig } from "motion/react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useDirectory } from "@/components/DirectoryProvider";
import { PeerSession, fetchIceServers } from "@/lib/webrtc";
import { BASE_PATH } from "@/lib/paths";
import { IncomingCall } from "./IncomingCall";
import { MinimizedIncoming } from "./MinimizedIncoming";
import { ActiveCall } from "./ActiveCall";

type Mode = "idle" | "incoming" | "active";

type CallApi = {
  mode: Mode;
  personId: string | null;
  startCall: (personId: string) => void;
  accept: () => void;
  end: () => void;
};

const Ctx = createContext<CallApi | null>(null);

export function useCall() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCall must be used inside CallProvider");
  return c;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { findPerson, isConnected, me } = useDirectory();
  const [mode, setMode] = useState<Mode>("idle");
  const [personId, setPersonId] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  // false while the caller is still ringing the callee; true once answered.
  const [connected, setConnected] = useState(false);
  // Capture the full person object at call-start so the overlay never renders
  // with undefined even if findPerson's closure is briefly stale.
  const [activePerson, setActivePerson] = useState<ReturnType<typeof findPerson>>(undefined);

  // Live media.
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const peerRef = useRef<PeerSession | null>(null);

  // Stable refs so signaling callbacks don't need them as deps.
  const findPersonRef = useRef(findPerson);
  useEffect(() => { findPersonRef.current = findPerson; }, [findPerson]);
  const isConnectedRef = useRef(isConnected);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);
  const personIdRef = useRef(personId);
  useEffect(() => { personIdRef.current = personId; }, [personId]);
  const meRef = useRef(me);
  useEffect(() => { meRef.current = me; }, [me]);

  // The shared broadcast channel — one per session.
  const sigRef = useRef<RealtimeChannel | null>(null);

  const signal = useCallback((event: string, payload: Record<string, unknown>) => {
    sigRef.current?.send({ type: "broadcast", event, payload });
  }, []);

  // Spin up a peer connection + local media and wire its outputs back to state.
  const makePeer = useCallback(async () => {
    const iceServers = await fetchIceServers();
    const peer = new PeerSession(iceServers);
    peer.onRemoteStream = (s) => setRemoteStream(s);
    peer.onIce = (candidate) => {
      const toId = personIdRef.current;
      if (toId) signal("call:ice", { toId, candidate });
    };
    peerRef.current = peer;
    const stream = await peer.start();
    setLocalStream(stream);
    return peer;
  }, [signal]);

  const cleanupPeer = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCamOff(false);
  }, []);

  const reset = useCallback(() => {
    cleanupPeer();
    setMode("idle");
    setPersonId(null);
    setActivePerson(undefined);
    setMinimized(false);
    setConnected(false);
  }, [cleanupPeer]);

  // Subscribe to the global calls channel for ring/accept/answer/ice/end.
  useEffect(() => {
    if (!me) return;
    const supabase = createClient();
    const ch = supabase.channel("calls", {
      config: { broadcast: { self: false } },
    });

    ch
      .on("broadcast", { event: "call:ring" }, ({ payload }) => {
        if (payload.calleeId !== meRef.current?.id) return;
        const p = findPersonRef.current(payload.callerId);
        // Ignore rings from people I've blocked or am not connected to.
        if (!p || p.blocked || !isConnectedRef.current(p.id)) return;
        setPersonId(payload.callerId);
        setActivePerson(p);
        setMinimized(false);
        setConnected(false);
        setMode("incoming");
      })
      // Callee answered and sent us their offer — start the timer, answer back.
      .on("broadcast", { event: "call:accept" }, async ({ payload }) => {
        if (payload.callerId !== meRef.current?.id) return;
        const peer = peerRef.current;
        if (!peer) return;
        setConnected(true);
        const answer = await peer.createAnswer(payload.offer);
        signal("call:answer", { calleeId: personIdRef.current, answer });
      })
      // Caller's answer to our offer — connection completes.
      .on("broadcast", { event: "call:answer" }, async ({ payload }) => {
        if (payload.calleeId !== meRef.current?.id) return;
        await peerRef.current?.acceptAnswer(payload.answer);
      })
      .on("broadcast", { event: "call:ice" }, ({ payload }) => {
        if (payload.toId !== meRef.current?.id) return;
        peerRef.current?.addIce(payload.candidate);
      })
      .on("broadcast", { event: "call:end" }, ({ payload }) => {
        if (payload.toId !== meRef.current?.id) return;
        reset();
      })
      .subscribe();

    sigRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      sigRef.current = null;
    };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCall = useCallback((id: string) => {
    setPersonId(id);
    setActivePerson(findPerson(id));
    setConnected(false); // ringing until the callee answers
    setMode("active");
    signal("call:ring", { callerId: meRef.current?.id, calleeId: id });
    // Prepare our peer + self-preview now; the offer is created once they accept.
    makePeer();
  }, [findPerson, signal, makePeer]);

  // Callee answers: grab media, create the offer, and signal acceptance.
  const accept = useCallback(async () => {
    setMinimized(false);
    setMode("active");
    setConnected(true);
    const peer = await makePeer();
    const offer = await peer.createOffer();
    signal("call:accept", { callerId: personIdRef.current, offer });
  }, [makePeer, signal]);

  const end = useCallback(() => {
    const otherId = personIdRef.current;
    if (otherId) signal("call:end", { toId: otherId });
    reset();
  }, [signal, reset]);

  // Reply instead of answering: decline the call and jump into the chat.
  const messageInstead = useCallback(
    (id: string, _text?: string) => {
      signal("call:end", { toId: id });
      reset();
      router.push(`/chat/?with=${id}`);
    },
    [router, signal, reset]
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      peerRef.current?.localStream?.getAudioTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }, []);

  const toggleCam = useCallback(() => {
    setCamOff((c) => {
      const next = !c;
      peerRef.current?.localStream?.getVideoTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }, []);

  // Register the notification service worker once.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${BASE_PATH}/sw.js`).catch(() => {});
    }
  }, []);

  // Accept/Decline tapped on the OS notification → drive the call here.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== "call-action") return;
      if (e.data.action === "accept") accept();
      else if (e.data.action === "decline") end();
      // "open" just focuses the window; the in-app overlay is already showing.
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [accept, end]);

  // Show a persistent OS notification with Accept/Decline while ringing.
  useEffect(() => {
    if (mode !== "incoming" || !activePerson) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const name = activePerson.name;
    let active = true;

    (async () => {
      let perm = Notification.permission;
      if (perm === "default") perm = await Notification.requestPermission();
      if (!active || perm !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      // `actions`/`requireInteraction` aren't in the base NotificationOptions
      // DOM type but are supported by ServiceWorkerRegistration.showNotification.
      reg.showNotification(`${name} is calling`, {
        body: "Incoming call on Frequency · silent",
        tag: "frequency-incoming-call",
        requireInteraction: true,
        actions: [
          { action: "accept", title: "Accept" },
          { action: "decline", title: "Decline" },
        ],
      } as NotificationOptions);
    })();

    // Clear the notification when the call is answered, declined, or times out.
    return () => {
      active = false;
      navigator.serviceWorker?.ready.then((reg) =>
        reg.getNotifications({ tag: "frequency-incoming-call" }).then((ns) =>
          ns.forEach((n) => n.close())
        )
      );
    };
  }, [mode, activePerson]);

  // flashing tab title while a call rings in (no audio ringtone, by design)
  useEffect(() => {
    if (mode !== "incoming" || !activePerson) return;
    const name = activePerson.name;
    const base = "Frequency — Dalton";
    let on = true;
    const t = setInterval(() => {
      document.title = on ? `📞 ${name} is calling…` : base;
      on = !on;
    }, 700);
    return () => {
      clearInterval(t);
      document.title = base;
    };
  }, [mode, activePerson]);

  return (
    <Ctx.Provider value={{ mode, personId, startCall, accept, end }}>
      <MotionConfig reducedMotion="user">
        {children}
        <AnimatePresence>
          {mode === "incoming" && activePerson && !minimized && (
            <IncomingCall
              key="incoming"
              person={activePerson}
              onAccept={accept}
              onDecline={end}
              onMinimize={() => setMinimized(true)}
              onMessage={(text) => messageInstead(activePerson.id, text)}
            />
          )}
          {mode === "incoming" && activePerson && minimized && (
            <MinimizedIncoming
              key="incoming-min"
              person={activePerson}
              onAccept={accept}
              onDecline={end}
              onExpand={() => setMinimized(false)}
            />
          )}
          {mode === "active" && activePerson && (
            <ActiveCall
              key="active"
              person={activePerson}
              connected={connected}
              localStream={localStream}
              remoteStream={remoteStream}
              muted={muted}
              camOff={camOff}
              onToggleMute={toggleMute}
              onToggleCam={toggleCam}
              onEnd={end}
            />
          )}
        </AnimatePresence>
      </MotionConfig>
    </Ctx.Provider>
  );
}
