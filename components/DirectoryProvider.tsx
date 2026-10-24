"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { colorFor, initialsOf } from "@/lib/mock";
import type { Person } from "@/lib/mock";

export type Me = {
  id: string;
  name: string;
  email: string;
  color: string;
  avatarUrl?: string;
  isDalton: boolean;
  isAdmin: boolean;
  disabled: boolean;
};

/** A pending connection request, incoming ("in") or sent by me ("out"). */
export type ConnectionRequest = {
  id: string;
  person: Person;
  direction: "in" | "out";
  createdAt: string;
};

/** Latest message in my 1:1 with someone — drives sidebar previews. */
export type Thread = {
  conversationId: string;
  lastKind: "text" | "image" | null;
  lastBody: string | null;
  lastFromMe: boolean;
  lastAt: string | null;
};

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  color: string | null;
  is_dalton: boolean;
  is_admin?: boolean;
  disabled?: boolean;
};

type ConnectionRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
};

type ThreadRow = {
  other_id: string;
  conversation_id: string;
  last_kind: "text" | "image" | null;
  last_body: string | null;
  last_sender: string | null;
  last_at: string | null;
};

type Api = {
  me: Me | null;
  /** Everyone I can message: fellow Dalton users + accepted connections. */
  people: Person[];
  requests: ConnectionRequest[];
  /** Keyed by the other person's id. */
  threads: Record<string, Thread>;
  loading: boolean;
  findPerson: (id: string) => Person | undefined;
  isConnected: (id: string) => boolean;
  block: (id: string) => Promise<void>;
  unblock: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Api | null>(null);

function toPerson(r: ProfileRow, blocked: Set<string>): Person {
  return {
    id: r.id,
    name: r.full_name,
    email: r.email,
    initials: initialsOf(r.full_name),
    color: r.color ?? colorFor(r.id),
    presence: "offline",
    pinned: false,
    blocked: blocked.has(r.id),
    isDalton: r.is_dalton,
  };
}

export function DirectoryProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [everyone, setEveryone] = useState<Person[]>([]);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [loading, setLoading] = useState(true);
  const onlineRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // RLS already limits profiles to people I'm allowed to see.
    const [{ data: profileRows }, { data: connRows }, { data: blockRows }, { data: threadRows }] =
      await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("connections").select("*"),
        supabase.from("blocks").select("blocked_id"),
        supabase.rpc("my_threads"),
      ]);

    const profiles = (profileRows ?? []) as ProfileRow[];
    const conns = (connRows ?? []) as ConnectionRow[];
    const blocked = new Set(((blockRows ?? []) as { blocked_id: string }[]).map((b) => b.blocked_id));

    const meRow = profiles.find((r) => r.id === user.id);
    if (meRow) {
      setMe({
        id: meRow.id,
        name: meRow.full_name,
        email: meRow.email,
        color: meRow.color ?? colorFor(meRow.id),
        avatarUrl: meRow.avatar_url ?? undefined,
        isDalton: meRow.is_dalton,
        isAdmin: !!meRow.is_admin,
        disabled: !!meRow.disabled,
      });
    }

    const others = profiles
      .filter((r) => r.id !== user.id)
      .map((r) => {
        const p = toPerson(r, blocked);
        p.presence = onlineRef.current.has(p.id) ? "online" : "offline";
        return p;
      });
    const byId = new Map(others.map((p) => [p.id, p]));

    const connected = new Set<string>();
    for (const p of others) {
      if (meRow?.is_dalton && p.isDalton) connected.add(p.id);
    }
    const reqs: ConnectionRequest[] = [];
    for (const c of conns) {
      const otherId = c.requester_id === user.id ? c.addressee_id : c.requester_id;
      if (c.status === "accepted") connected.add(otherId);
      else if (c.status === "pending") {
        const person = byId.get(otherId);
        if (person) {
          reqs.push({
            id: c.id,
            person,
            direction: c.addressee_id === user.id ? "in" : "out",
            createdAt: c.created_at,
          });
        }
      }
    }

    const t: Record<string, Thread> = {};
    for (const r of (threadRows ?? []) as ThreadRow[]) {
      t[r.other_id] = {
        conversationId: r.conversation_id,
        lastKind: r.last_kind,
        lastBody: r.last_body,
        lastFromMe: r.last_sender === user.id,
        lastAt: r.last_at,
      };
    }

    setEveryone(others);
    setConnectedIds(connected);
    setRequests(reqs);
    setThreads(t);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Supabase Realtime Presence — track who has the app open.
  useEffect(() => {
    if (!me) return;
    const supabase = createClient();
    const channel = supabase.channel("presence:online", {
      config: { presence: { key: me.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const onlineIds = new Set(Object.keys(channel.presenceState()));
        onlineRef.current = onlineIds;
        setEveryone((prev) =>
          prev.map((p) => ({
            ...p,
            presence: onlineIds.has(p.id) ? ("online" as const) : ("offline" as const),
          }))
        );
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: me.id });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live updates: new requests/accepts reload the directory; new messages in
  // any of my conversations refresh that thread's preview.
  const threadsRef = useRef(threads);
  useEffect(() => { threadsRef.current = threads; }, [threads]);

  useEffect(() => {
    if (!me) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`directory:${me.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, () => {
        load();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const r = payload.new as {
          conversation_id: string;
          sender_id: string;
          kind: "text" | "image";
          body: string | null;
          created_at: string;
        };
        const otherId = Object.keys(threadsRef.current).find(
          (id) => threadsRef.current[id].conversationId === r.conversation_id
        );
        if (!otherId) {
          load(); // a conversation we haven't seen yet
          return;
        }
        setThreads((prev) => ({
          ...prev,
          [otherId]: {
            conversationId: r.conversation_id,
            lastKind: r.kind,
            lastBody: r.body,
            lastFromMe: r.sender_id === me.id,
            lastAt: r.created_at,
          },
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [me?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const block = useCallback(
    async (id: string) => {
      if (!me) return;
      const supabase = createClient();
      await supabase.from("blocks").insert({ blocker_id: me.id, blocked_id: id });
      await load();
    },
    [me, load]
  );

  const unblock = useCallback(
    async (id: string) => {
      if (!me) return;
      const supabase = createClient();
      await supabase.from("blocks").delete().eq("blocker_id", me.id).eq("blocked_id", id);
      await load();
    },
    [me, load]
  );

  const people = everyone.filter((p) => connectedIds.has(p.id));
  const findPerson = useCallback((id: string) => everyone.find((p) => p.id === id), [everyone]);
  const isConnected = useCallback((id: string) => connectedIds.has(id), [connectedIds]);

  return (
    <Ctx.Provider
      value={{ me, people, requests, threads, loading, findPerson, isConnected, block, unblock, refresh: load }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useDirectory() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDirectory must be used inside DirectoryProvider");
  return c;
}
