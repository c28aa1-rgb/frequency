"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Shield, Flag, Block, Close } from "@/components/icons";
import { useDirectory } from "@/components/DirectoryProvider";
import { createClient } from "@/lib/supabase/client";
import { colorFor, initialsOf } from "@/lib/mock";
import { clockTime, timeAgo } from "@/lib/format";

type Source = "auto-text" | "auto-image" | "user";

type Evidence = {
  id: string;
  sender_id: string;
  kind: "text" | "image";
  body?: string | null;
  image_path?: string | null;
  created_at: string;
};

type Report = {
  id: string;
  source: Source;
  reporter_id: string | null;
  target_id: string;
  reason: string;
  detail: string | null;
  evidence: Evidence[];
  status: "open" | "resolved";
  resolution: string | null;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string;
  email: string;
  color: string | null;
  disabled: boolean;
};

type Term = { term: string; category: string };

const sourceLabel: Record<Source, string> = {
  "auto-text": "Auto · text",
  "auto-image": "Auto · image",
  user: "User report",
};

export default function AdminPage() {
  const { me } = useDirectory();
  const [reports, setReports] = useState<Report[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [terms, setTerms] = useState<Term[]>([]);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: reportRows }, { data: termRows }] = await Promise.all([
      supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("moderation_terms").select("term, category").order("term"),
    ]);
    const list = (reportRows ?? []) as Report[];

    const ids = new Set<string>();
    for (const r of list) {
      ids.add(r.target_id);
      if (r.reporter_id) ids.add(r.reporter_id);
      for (const e of r.evidence) ids.add(e.sender_id);
    }
    const { data: profileRows } = ids.size
      ? await supabase.from("profiles").select("id, full_name, email, color, disabled").in("id", [...ids])
      : { data: [] };

    setReports(list);
    setProfiles(Object.fromEntries(((profileRows ?? []) as Profile[]).map((p) => [p.id, p])));
    setTerms((termRows ?? []) as Term[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (me?.isAdmin) load();
  }, [me?.isAdmin, load]);

  if (me && !me.isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center bg-paper text-ink-soft">
        This page is for moderators.
      </div>
    );
  }

  const shown = reports.filter((r) => (filter === "open" ? r.status === "open" : true));
  const openCount = reports.filter((r) => r.status === "open").length;

  async function act(r: Report, action: "dismiss" | "reset" | "disable" | "enable") {
    const supabase = createClient();
    if (action === "reset") await supabase.rpc("admin_reset_color", { target: r.target_id });
    if (action === "disable") await supabase.rpc("admin_set_disabled", { target: r.target_id, value: true });
    if (action === "enable") await supabase.rpc("admin_set_disabled", { target: r.target_id, value: false });
    if (action !== "enable") {
      const outcome = { dismiss: "dismissed", reset: "icon reset", disable: "user disabled" }[action];
      await supabase.rpc("admin_resolve_report", { report: r.id, outcome });
    }
    load();
  }

  return (
    <div className="flex-1 overflow-y-auto bg-paper">
      <div className="mx-auto max-w-3xl px-8 py-10">
        <div className="flex items-center gap-2.5">
          <Shield className="h-6 w-6 text-signal" />
          <h1 className="font-display text-3xl font-extrabold text-ink">Moderation</h1>
          <span className="ml-auto rounded-full bg-alert px-2.5 py-1 font-mono text-xs text-white">
            {openCount} open
          </span>
        </div>
        <p className="mt-2 text-ink-soft">
          Messages that match a flagged word and reports from users land here, with a snapshot of
          the messages — kept even after the chat clears.
        </p>

        {/* filter */}
        <div className="mt-6 flex gap-2">
          {(["open", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${
                filter === f ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft hover:bg-paper"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          {shown.map((r) => {
            const target = profiles[r.target_id];
            const reporter = r.reporter_id ? profiles[r.reporter_id] : null;
            const name = target?.full_name ?? "Unknown user";
            return (
              <div key={r.id} className="rounded-card border border-line bg-surface p-5">
                <div className="flex items-start gap-3">
                  <Avatar
                    initials={initialsOf(name)}
                    color={target?.color ?? colorFor(r.target_id)}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{name}</p>
                      <span className="u-label rounded-full bg-paper px-2 py-0.5 text-ink-soft">
                        {sourceLabel[r.source]}
                      </span>
                      {target?.disabled && <span className="u-label text-alert">disabled</span>}
                      {r.status === "resolved" && (
                        <span className="u-label text-live">✓ {r.resolution ?? "resolved"}</span>
                      )}
                      <span className="ml-auto font-mono text-xs text-ink-soft">{timeAgo(r.created_at)}</span>
                    </div>
                    {target && <p className="font-mono text-xs text-ink-soft">{target.email}</p>}
                    <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-ink">
                      <Flag className="h-4 w-4 text-alert" /> {r.reason}
                    </p>
                    {r.detail && <p className="mt-1 text-sm text-ink-soft">{r.detail}</p>}
                    {reporter && (
                      <p className="mt-1 font-mono text-xs text-ink-soft">reported by {reporter.full_name}</p>
                    )}

                    {r.evidence.length > 0 && (
                      <EvidenceList evidence={r.evidence} profiles={profiles} targetId={r.target_id} />
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {r.status === "open" && (
                        <>
                          <Action onClick={() => act(r, "dismiss")}>Dismiss</Action>
                          <Action onClick={() => act(r, "reset")} primary>
                            Reset icon color
                          </Action>
                          {!target?.disabled && (
                            <Action onClick={() => act(r, "disable")} danger>
                              <Block className="h-4 w-4" /> Disable user
                            </Action>
                          )}
                        </>
                      )}
                      {target?.disabled && <Action onClick={() => act(r, "enable")}>Re-enable user</Action>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {!loading && shown.length === 0 && (
            <div className="rounded-card border border-dashed border-line bg-surface py-16 text-center">
              <p className="font-display text-lg font-bold text-ink">All clear.</p>
              <p className="mt-1 text-sm text-ink-soft">No open reports right now.</p>
            </div>
          )}
        </div>

        <TermsEditor terms={terms} onChange={load} />
      </div>
    </div>
  );
}

function EvidenceList({
  evidence,
  profiles,
  targetId,
}: {
  evidence: Evidence[];
  profiles: Record<string, Profile>;
  targetId: string;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  // Admins can open evidence images while the file still exists (3 days).
  useEffect(() => {
    const paths = evidence.filter((e) => e.image_path).map((e) => e.image_path!);
    if (paths.length === 0) return;
    const supabase = createClient();
    supabase.storage
      .from("chat-images")
      .createSignedUrls(paths, 60 * 10)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
        setUrls(map);
      });
  }, [evidence]);

  return (
    <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto rounded-xl bg-paper p-3">
      {evidence.map((e) => (
        <div key={e.id} className="text-sm">
          <span className={`font-semibold ${e.sender_id === targetId ? "text-alert" : "text-ink"}`}>
            {profiles[e.sender_id]?.full_name.split(" ")[0] ?? "?"}
          </span>
          <span className="ml-2 font-mono text-[0.65rem] text-ink-soft">{clockTime(e.created_at)}</span>
          <p className="text-ink-soft">
            {e.kind === "image" ? (
              e.image_path && urls[e.image_path] ? (
                <a href={urls[e.image_path]} target="_blank" rel="noreferrer" className="text-signal-ink underline">
                  📷 view image
                </a>
              ) : (
                "📷 image (expired)"
              )
            ) : (
              e.body
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

function TermsEditor({ terms, onChange }: { terms: Term[]; onChange: () => void }) {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("harassment");
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = term.trim().toLowerCase().replace(/\s+/g, " ");
    if (!/^[a-z0-9' ]+$/.test(t)) {
      setError("Letters, numbers, spaces and apostrophes only.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("moderation_terms").insert({ term: t, category });
    if (error) {
      setError(error.code === "23505" ? "Already on the list." : error.message);
      return;
    }
    setError(null);
    setTerm("");
    onChange();
  }

  async function remove(t: string) {
    const supabase = createClient();
    await supabase.from("moderation_terms").delete().eq("term", t);
    onChange();
  }

  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-bold text-ink">Flagged words</h2>
      <p className="mt-1 text-sm text-ink-soft">
        A text message containing any of these (as a whole word, any case) is sent here automatically.
        The message still goes through.
      </p>

      <form onSubmit={add} className="mt-4 flex gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="word or phrase"
          className="h-10 flex-1 rounded-full border border-line bg-surface px-4 text-sm outline-none focus:border-signal"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-10 rounded-full border border-line bg-surface px-3 text-sm outline-none"
        >
          {["harassment", "self-harm", "sexual", "hate", "violence", "other"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!term.trim()}
          className="rounded-full bg-signal px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-alert">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {terms.map((t) => (
          <span
            key={t.term}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-3 pr-1.5 text-sm"
          >
            {t.term}
            <span className="font-mono text-[0.65rem] text-ink-soft">{t.category}</span>
            <button
              onClick={() => remove(t.term)}
              className="rounded-full p-0.5 text-ink-soft hover:bg-paper hover:text-alert"
              aria-label={`Remove ${t.term}`}
            >
              <Close className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
    </section>
  );
}

function Action({
  children,
  onClick,
  primary,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        primary
          ? "bg-signal text-white hover:brightness-110"
          : danger
          ? "bg-alert/10 text-alert hover:bg-alert/20"
          : "border border-line bg-surface text-ink-soft hover:bg-paper"
      }`}
    >
      {children}
    </button>
  );
}
