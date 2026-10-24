"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Users, Check, Close, Block } from "@/components/icons";
import { useDirectory } from "@/components/DirectoryProvider";
import { usePersonView } from "@/components/OverridesProvider";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/format";
import type { Person } from "@/lib/mock";

const RESULT_TEXT: Record<string, string> = {
  sent: "Request sent — they’ll see it next time they open Frequency.",
  accepted: "They’d already asked you — you’re connected now.",
  already: "You’re already connected.",
  pending: "There’s already a request waiting between you two.",
  self: "That’s your own address.",
  not_found:
    "No one with that address has signed in yet. Ask them to sign in to Frequency once with Google, then try again.",
};

export default function ConnectionsPage() {
  const { me, people, requests, unblock, refresh } = useDirectory();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const incoming = requests.filter((r) => r.direction === "in");
  const outgoing = requests.filter((r) => r.direction === "out");
  // Dalton ↔ Dalton links are automatic; these are the ones made by request.
  const outside = people.filter((p) => !(me?.isDalton && p.isDalton));
  const blocked = people.filter((p) => p.blocked);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setResult(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("request_connection", { target_email: email.trim() });
    setBusy(false);
    if (error) {
      setResult({ ok: false, text: error.message });
      return;
    }
    const code = data as string;
    setResult({ ok: code === "sent" || code === "accepted", text: RESULT_TEXT[code] ?? code });
    if (code === "sent" || code === "accepted") setEmail("");
    refresh();
  }

  async function respond(id: string, accept: boolean) {
    const supabase = createClient();
    await supabase.rpc("respond_connection", { request: id, accept });
    refresh();
  }

  async function remove(personId: string) {
    const supabase = createClient();
    await supabase.rpc("remove_connection", { other: personId });
    refresh();
  }

  return (
    <div className="flex-1 overflow-y-auto bg-paper">
      <div className="mx-auto max-w-xl px-8 py-10">
        <div className="flex items-center gap-2.5">
          <Users className="h-6 w-6 text-signal" />
          <h1 className="font-display text-3xl font-extrabold text-ink">Connections</h1>
        </div>
        <p className="mt-2 text-ink-soft">
          {me?.isDalton
            ? "Everyone at Dalton is connected automatically. To chat with someone outside Dalton, send them a request."
            : "You can chat with people who accept your request. Ask a friend for the Google address they sign in with."}
        </p>

        {/* invite */}
        <form onSubmit={invite} className="mt-7 rounded-card border border-line bg-surface p-5">
          <label className="mb-1.5 block text-sm font-semibold text-ink">Connect by email</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@gmail.com"
              className="h-11 flex-1 rounded-full border border-line bg-paper px-4 text-sm outline-none focus:border-signal"
            />
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="rounded-full bg-signal px-5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send request"}
            </button>
          </div>
          {result && (
            <p className={`mt-3 text-sm ${result.ok ? "text-live" : "text-ink-soft"}`}>{result.text}</p>
          )}
        </form>

        <Group label={`Requests for you · ${incoming.length}`} empty="No requests waiting.">
          {incoming.map((r) => (
            <PersonRow key={r.id} person={r.person} meta={`asked ${timeAgo(r.createdAt)} ago`}>
              <SmallBtn primary onClick={() => respond(r.id, true)}>
                <Check className="h-4 w-4" /> Accept
              </SmallBtn>
              <SmallBtn onClick={() => respond(r.id, false)}>
                <Close className="h-4 w-4" /> Decline
              </SmallBtn>
            </PersonRow>
          ))}
        </Group>

        {outgoing.length > 0 && (
          <Group label={`Sent · ${outgoing.length}`}>
            {outgoing.map((r) => (
              <PersonRow key={r.id} person={r.person} meta={`waiting · sent ${timeAgo(r.createdAt)} ago`}>
                <SmallBtn onClick={() => remove(r.person.id)}>Withdraw</SmallBtn>
              </PersonRow>
            ))}
          </Group>
        )}

        <Group
          label={me?.isDalton ? `Outside Dalton · ${outside.length}` : `Connected · ${outside.length}`}
          empty="No connections yet."
        >
          {outside.map((p) => (
            <PersonRow key={p.id} person={p} meta={p.email} href={`/chat/?with=${p.id}`}>
              <SmallBtn
                onClick={() => {
                  if (confirm(`Remove ${p.name}? You won’t be able to message each other until one of you sends a new request.`))
                    remove(p.id);
                }}
              >
                Remove
              </SmallBtn>
            </PersonRow>
          ))}
        </Group>

        {blocked.length > 0 && (
          <Group label={`Blocked · ${blocked.length}`}>
            {blocked.map((p) => (
              <PersonRow key={p.id} person={p} meta="can’t message or call you">
                <SmallBtn onClick={() => unblock(p.id)}>
                  <Block className="h-4 w-4" /> Unblock
                </SmallBtn>
              </PersonRow>
            ))}
          </Group>
        )}
      </div>
    </div>
  );
}

function Group({
  label,
  empty,
  children,
}: {
  label: string;
  empty?: string;
  children: React.ReactNode;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section className="mt-8">
      <p className="u-label mb-2 px-1 text-ink-soft">{label}</p>
      {hasItems ? (
        <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {children}
        </div>
      ) : (
        empty && <p className="px-1 text-sm text-ink-soft">{empty}</p>
      )}
    </section>
  );
}

function PersonRow({
  person,
  meta,
  href,
  children,
}: {
  person: Person;
  meta: string;
  href?: string;
  children: React.ReactNode;
}) {
  const view = usePersonView(person);
  const who = (
    <>
      <Avatar initials={view.initials} color={view.color} size="md" presence={person.presence} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{view.name}</p>
        <p className="truncate font-mono text-xs text-ink-soft">{meta}</p>
      </div>
    </>
  );
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80">
          {who}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{who}</div>
      )}
      <div className="flex shrink-0 gap-1.5">{children}</div>
    </div>
  );
}

function SmallBtn({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        primary ? "bg-live text-white hover:brightness-110" : "border border-line text-ink-soft hover:bg-paper"
      }`}
    >
      {children}
    </button>
  );
}
