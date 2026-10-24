"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Person } from "@/lib/mock";
import { Avatar } from "./Avatar";
import { Wordmark } from "./Logo";
import { Search, Pin, Shield, Logout, Users } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { useOverrides, usePersonView } from "./OverridesProvider";
import { useDirectory } from "./DirectoryProvider";
import type { Thread } from "./DirectoryProvider";
import { Skeleton, RowSkeleton } from "./Skeleton";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/format";

export function Sidebar() {
  const pathname = usePathname().replace(/\/$/, "");
  const router = useRouter();
  const search = useSearchParams();
  const activeId = pathname === "/chat" ? search.get("with") : null;
  const [q, setQ] = useState("");
  const { overrides } = useOverrides();
  const { me, people, requests, threads, loading } = useDirectory();
  const [openReports, setOpenReports] = useState(0);

  const meView = usePersonView({
    id: "me",
    name: me?.name ?? "You",
    color: me?.color ?? "#3a66ff",
    lockName: true,
  });
  const isAdmin = !!me?.isAdmin;
  const incoming = requests.filter((r) => r.direction === "in").length;

  useEffect(() => {
    if (!isAdmin) return;
    const supabase = createClient();
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .then(({ count }) => setOpenReports(count ?? 0));
  }, [isAdmin, pathname]);

  const effName = (p: Person) => overrides[p.id]?.name?.trim() || p.name;
  const visible = people
    .filter((p) => !p.blocked)
    .filter((p) => effName(p).toLowerCase().includes(q.toLowerCase()));

  const pinned = visible.filter((p) => p.pinned);
  const online = visible.filter((p) => !p.pinned && p.presence === "online");
  const offline = visible.filter((p) => !p.pinned && p.presence === "offline");

  return (
    <aside className="flex h-screen w-[340px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="px-5 pt-5 pb-3">
        <Wordmark />
      </div>

      {/* search */}
      <div className="px-5 pb-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-paper px-3.5 py-2.5">
          <Search className="h-4 w-4 text-ink-soft" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={me && !me.isDalton ? "Search your connections" : "Search everyone at Dalton"}
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-soft"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {loading ? (
          <div className="pt-3">
            <Skeleton className="mb-2 ml-3 h-2.5 w-16" />
            {Array.from({ length: 6 }).map((_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        ) : (
          <>
            <Section label="Pinned" people={pinned} threads={threads} activeId={activeId} />
            <Section label={`Online · ${online.length}`} people={online} threads={threads} activeId={activeId} />
            <Section label="Everyone else" people={offline} threads={threads} activeId={activeId} dim />
            {visible.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-ink-soft">
                {q
                  ? `No one matches “${q}”.`
                  : me && !me.isDalton
                  ? "No connections yet — invite someone from Connections below."
                  : "Quiet for now — no one else has signed in yet."}
              </p>
            )}
          </>
        )}
      </nav>

      {/* connections, admin, self */}
      <div className="border-t border-line p-3">
        <Link
          href="/connections"
          className={`mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
            pathname === "/connections" ? "bg-signal/10 text-signal-ink" : "text-ink-soft hover:bg-paper"
          }`}
        >
          <Users className="h-4 w-4" /> Connections
          {incoming > 0 && (
            <span className="ml-auto rounded-full bg-signal px-1.5 py-0.5 font-mono text-[0.65rem] text-white">
              {incoming}
            </span>
          )}
        </Link>
        {isAdmin && (
          <Link
            href="/admin"
            className={`mb-2 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              pathname === "/admin" ? "bg-signal/10 text-signal-ink" : "text-ink-soft hover:bg-paper"
            }`}
          >
            <Shield className="h-4 w-4" /> Admin
            {openReports > 0 && (
              <span className="ml-auto rounded-full bg-alert px-1.5 py-0.5 font-mono text-[0.65rem] text-white">
                {openReports}
              </span>
            )}
          </Link>
        )}
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Link href="/profile" className="flex flex-1 items-center gap-3">
            <Avatar initials={meView.initials} color={meView.color} size="md" presence="online" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{meView.name}</p>
              <p className="truncate font-mono text-xs text-ink-soft">{me?.email ?? ""}</p>
            </div>
          </Link>
          <ThemeToggle />
          <button
            onClick={async () => {
              const supabase = createClient();
              await supabase.auth.signOut();
              router.push("/");
              router.refresh();
            }}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-lg p-2 text-ink-soft hover:bg-paper"
          >
            <Logout className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function Section({
  label,
  people: list,
  threads,
  activeId,
  dim,
}: {
  label: string;
  people: Person[];
  threads: Record<string, Thread>;
  activeId: string | null;
  dim?: boolean;
}) {
  if (list.length === 0) return null;
  return (
    <div className="mb-2">
      <p className="u-label px-3 pb-1 pt-3 text-ink-soft">{label}</p>
      {list.map((p) => (
        <Row key={p.id} person={p} thread={threads[p.id]} active={activeId === p.id} dim={dim} />
      ))}
    </div>
  );
}

function Row({
  person,
  thread,
  active,
  dim,
}: {
  person: Person;
  thread?: Thread;
  active: boolean;
  dim?: boolean;
}) {
  const view = usePersonView(person);
  const lastAt = thread?.lastAt;
  const preview = !thread?.lastKind
    ? "Say hi — say anything."
    : `${thread.lastFromMe ? "You: " : ""}${thread.lastKind === "image" ? "📷 Photo" : thread.lastBody}`;

  return (
    <Link
      href={`/chat/?with=${person.id}`}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
        active ? "bg-signal/10" : "hover:bg-paper"
      }`}
    >
      <Avatar initials={view.initials} color={view.color} size="md" presence={person.presence} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {person.pinned && <Pin className="h-3 w-3 text-marigold" />}
          <p className={`truncate text-sm font-semibold ${dim ? "text-ink/80" : ""}`}>{view.name}</p>
          {lastAt && <span className="ml-auto font-mono text-[0.65rem] text-ink-soft">{timeAgo(lastAt)}</span>}
        </div>
        <p className="truncate text-xs text-ink-soft">{preview}</p>
      </div>
    </Link>
  );
}
