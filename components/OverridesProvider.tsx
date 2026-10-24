"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { initialsOf } from "@/lib/mock";

// Per-person view overrides. Your own name is locked to Google; you can recolor
// your own icon and set a private nickname + color for anyone else (visible
// only to you). Persisted to localStorage so it sticks across reloads.
type Override = { name?: string; color?: string };
type Overrides = Record<string, Override>;

type Api = {
  overrides: Overrides;
  setOverride: (id: string, patch: Override) => void;
  clearOverride: (id: string) => void;
};

const Ctx = createContext<Api | null>(null);
const KEY = "frequency-overrides";

export function OverridesProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Overrides>({});

  useEffect(() => {
    try {
      const s = localStorage.getItem(KEY);
      if (s) setOverrides(JSON.parse(s));
    } catch {}
  }, []);

  const persist = useCallback((next: Overrides) => {
    setOverrides(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const setOverride = useCallback(
    (id: string, patch: Override) =>
      setOverrides((prev) => {
        const next = { ...prev, [id]: { ...prev[id], ...patch } };
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {}
        return next;
      }),
    []
  );

  const clearOverride = useCallback(
    (id: string) =>
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {}
        return next;
      }),
    []
  );

  return (
    <Ctx.Provider value={{ overrides, setOverride, clearOverride }}>
      {children}
    </Ctx.Provider>
  );
}

export function useOverrides() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOverrides must be used inside OverridesProvider");
  return c;
}

type Base = { id: string; name: string; color: string; lockName?: boolean };

// Effective name/color/initials for a person after applying overrides.
export function usePersonView(p: Base) {
  const { overrides } = useOverrides();
  const o = overrides[p.id] ?? {};
  // lockName (used for the signed-in user) ignores any name override.
  const name = !p.lockName && o.name?.trim() ? (o.name as string) : p.name;
  const color = o.color ?? p.color;
  return {
    name,
    color,
    initials: initialsOf(name),
    customName: !p.lockName && !!o.name?.trim(),
    customColor: !!o.color,
  };
}
