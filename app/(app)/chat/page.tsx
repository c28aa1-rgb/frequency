"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AVATAR_COLORS, initialsOf } from "@/lib/mock";
import type { Message } from "@/lib/mock";
import { Avatar } from "@/components/Avatar";
import { useCall } from "@/components/call/CallProvider";
import { useDirectory } from "@/components/DirectoryProvider";
import { usePersonView, useOverrides } from "@/components/OverridesProvider";
import { createClient } from "@/lib/supabase/client";

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: "text" | "image";
  body: string | null;
  image_path: string | null;
  created_at: string;
};

function toMessage(r: MessageRow, myId: string): Message {
  const ageHours = (Date.now() - new Date(r.created_at).getTime()) / 3_600_000;
  return {
    id: r.id,
    authorId: r.sender_id === myId ? "me" : r.sender_id,
    kind: r.kind,
    body: r.body ?? undefined,
    imagePath: r.image_path ?? undefined,
    sentAt: r.created_at,
    expiresInHours: Math.max(0, 72 - ageHours),
  };
}

const IMAGE_BUCKET = "chat-images";
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Images live in a private bucket; swap each path for a short-lived signed URL.
async function signImages(
  supabase: ReturnType<typeof createClient>,
  msgs: Message[]
): Promise<Message[]> {
  const paths = msgs.filter((m) => m.imagePath && !m.imageUrl).map((m) => m.imagePath!);
  if (paths.length === 0) return msgs;
  const { data } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(paths, 60 * 60);
  const urls = new Map<string, string>();
  for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  return msgs.map((m) => (m.imagePath && urls.has(m.imagePath) ? { ...m, imageUrl: urls.get(m.imagePath) } : m));
}

const REPORT_REASONS = ["Harassment or bullying", "Spam", "Inappropriate image", "Something else"];
import { MessageSkeleton } from "@/components/Skeleton";
import { Phone, Video, Pin, Block, Flag, Send, ImageIcon, Close, Users } from "@/components/icons";
import { clockTime, expiryLabel, isExpiring } from "@/lib/format";

// Static export can't have a page per user, so the person comes from ?with=<id>.
export default function ChatRoute() {
  return (
    <Suspense>
      <ChatPage />
    </Suspense>
  );
}

function ChatPage() {
  const id = useSearchParams().get("with") ?? "";
  const router = useRouter();
  const { findPerson, isConnected, block, unblock, me, loading: dirLoading } = useDirectory();
  const person = findPerson(id);
  const { startCall } = useCall();
  const canMessage = !!person && isConnected(id) && !person.blocked;

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pinned, setPinned] = useState(person?.pinned ?? false);
  const { setOverride, clearOverride } = useOverrides();
  const view = usePersonView({
    id,
    name: person?.name ?? "",
    color: person?.color ?? "#3a66ff",
  });
  // A just-sent text bubble shown at the composer for one beat, so its
  // shared layoutId can morph up into the thread (iMessage-style).
  const [pending, setPending] = useState<{ id: string; text: string } | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [dmError, setDmError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Load (or create) the 1:1 conversation + its messages, then stream new ones.
  useEffect(() => {
    if (!me) return;
    let active = true;
    const supabase = createClient();
    setLoading(true);
    setMessages([]);
    setConversationId(null);
    setDmError(null);
    setPinned(findPerson(id)?.pinned ?? false);

    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: conv, error } = await supabase.rpc("get_or_create_dm", { other: id });
      if (!active) return;
      if (error || !conv) {
        setDmError(error?.message ?? "unavailable");
        setLoading(false);
        return;
      }
      setConversationId(conv as string);

      const { data: rows } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conv)
        .order("created_at");
      if (!active) return;
      const loaded = await signImages(
        supabase,
        (rows ?? []).map((r) => toMessage(r as MessageRow, me.id))
      );
      if (!active) return;
      setMessages(loaded);
      setLoading(false);

      channel = supabase
        .channel(`messages:${conv}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conv}`,
          },
          async (payload) => {
            const r = payload.new as MessageRow;
            const [msg] = await signImages(supabase, [toMessage(r, me.id)]);
            setMessages((prev) => (prev.some((m) => m.id === r.id) ? prev : [...prev, msg]));
          }
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, me?.id, canMessage]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!person) {
    return (
      <div className="flex flex-1 items-center justify-center text-ink-soft">
        {dirLoading ? "Loading…" : "That person isn’t here."}
      </div>
    );
  }

  async function sendText(text: string) {
    if (!conversationId || !me) return;
    const mid = crypto.randomUUID();
    // 1. paint the source bubble at the composer (shares layoutId with the list
    //    bubble) and optimistically add it so it morphs up; 2. persist it.
    setPending({ id: mid, text });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setMessages((m) => [
          ...m,
          {
            id: mid,
            authorId: "me",
            kind: "text",
            body: text,
            sentAt: new Date().toISOString(),
            expiresInHours: 72,
          },
        ]);
        setPending(null);
      })
    );
    const supabase = createClient();
    const { error } = await supabase.from("messages").insert({
      id: mid,
      conversation_id: conversationId,
      sender_id: me.id,
      kind: "text",
      body: text,
    });
    if (error) {
      setMessages((m) => m.filter((x) => x.id !== mid));
      setNotice("Couldn’t send that message.");
    }
  }

  async function sendImage(file: File) {
    if (!conversationId || !me) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setNotice("Only PNG, JPEG, GIF or WebP images.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setNotice("Images must be under 5 MB.");
      return;
    }
    const mid = crypto.randomUUID();
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `${conversationId}/${mid}.${ext}`;
    // Show the local file right away; the upload + insert follow.
    setMessages((m) => [
      ...m,
      {
        id: mid,
        authorId: "me",
        kind: "image",
        imagePath: path,
        imageUrl: URL.createObjectURL(file),
        sentAt: new Date().toISOString(),
        expiresInHours: 72,
      },
    ]);

    const supabase = createClient();
    const upload = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, file, { contentType: file.type });
    const insert = upload.error
      ? upload
      : await supabase.from("messages").insert({
          id: mid,
          conversation_id: conversationId,
          sender_id: me.id,
          kind: "image",
          image_path: path,
        });
    if (insert.error) {
      setMessages((m) => m.filter((x) => x.id !== mid));
      setNotice("Couldn’t send that image.");
    }
  }

  async function blockPerson() {
    if (!person) return;
    setMenu(false);
    if (!confirm(`Block ${person.name}? They won’t be able to message or call you.`)) return;
    await block(person.id);
    router.push("/chats");
  }

  return (
    <div className="flex h-full flex-col bg-paper">
      {/* header */}
      <header className="flex items-center gap-3 border-b border-line bg-surface px-6 py-3.5">
        <button
          onClick={() => setEditing(true)}
          title="Edit name & color"
          className="-m-1 flex items-center gap-3 rounded-lg p-1 text-left hover:bg-paper"
        >
          <Avatar initials={view.initials} color={view.color} size="md" presence={person.presence} pulse />
          <div className="min-w-0">
            <p className="font-display font-bold leading-tight">{view.name}</p>
            <p className="font-mono text-xs text-ink-soft">
              {person.presence === "online" ? "● tab open now" : "tab closed"}
            </p>
          </div>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          {canMessage && (
            <>
              <IconBtn label="Audio call" onClick={() => startCall(person.id)}>
                <Phone className="h-5 w-5" />
              </IconBtn>
              <IconBtn label="Video call" onClick={() => startCall(person.id)} primary>
                <Video className="h-5 w-5" />
              </IconBtn>
            </>
          )}
          <div className="relative">
            <IconBtn label="More" onClick={() => setMenu((v) => !v)}>
              <span className="text-lg leading-none">⋯</span>
            </IconBtn>
            {menu && (
              <div
                className="absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-xl"
                onMouseLeave={() => setMenu(false)}
              >
                <MenuItem onClick={() => setPinned((p) => !p)}>
                  <Pin className="h-4 w-4 text-marigold" /> {pinned ? "Unpin" : "Pin to top"}
                </MenuItem>
                <MenuItem onClick={() => { setMenu(false); setReporting(true); }}>
                  <Flag className="h-4 w-4 text-ink-soft" /> Report…
                </MenuItem>
                {person.blocked ? (
                  <MenuItem onClick={() => { setMenu(false); unblock(person.id); }}>
                    <Block className="h-4 w-4" /> Unblock
                  </MenuItem>
                ) : (
                  <MenuItem danger onClick={blockPerson}>
                    <Block className="h-4 w-4" /> Block
                  </MenuItem>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* retention notice */}
      <div className="border-b border-line bg-paper px-6 py-2 text-center">
        <span className="u-label text-ink-soft">
          Messages in this chat clear automatically after 3 days
        </span>
      </div>

      {/* messages */}
      <div className="flex-1 space-y-1 overflow-y-auto px-6 py-5">
        {loading ? (
          <div className="space-y-3">
            <MessageSkeleton w={150} />
            <MessageSkeleton mine w={200} />
            <MessageSkeleton w={120} />
            <MessageSkeleton mine w={170} />
            <MessageSkeleton w={210} />
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <Bubble
                key={m.id}
                m={m}
                person={{ initials: view.initials, color: view.color }}
                prev={messages[i - 1]}
              />
            ))}
          </AnimatePresence>
        )}
        <div ref={endRef} />
      </div>

      {/* composer */}
      <div className="relative border-t border-line bg-surface px-4 py-3">
        <AnimatePresence>
          {notice && (
            <motion.p
              key="notice"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-paper shadow-lg"
            >
              {notice}
            </motion.p>
          )}
        </AnimatePresence>
        {!canMessage || dmError ? (
          <CannotMessage
            name={view.name}
            blocked={person.blocked}
            connected={isConnected(id)}
            onUnblock={() => unblock(person.id)}
          />
        ) : (
        <>
        {/* source bubble: sits over the input, morphs up into the thread */}
        {pending && (
          <motion.div
            layoutId={`bubble-${pending.id}`}
            className="pointer-events-none absolute bottom-[14px] right-16 max-w-[60%] rounded-2xl bg-signal px-3.5 py-2 text-sm leading-relaxed text-white"
          >
            {pending.text}
          </motion.div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            sendText(draft.trim());
            setDraft("");
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) sendImage(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!conversationId}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-paper disabled:opacity-40"
            title="Send image"
          >
            <ImageIcon className="h-5 w-5" />
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${view.name.split(" ")[0]}`}
            className="h-11 flex-1 rounded-full border border-line bg-paper px-4 text-sm outline-none focus:border-signal"
          />
          <motion.button
            type="submit"
            whileTap={{ scale: 0.88 }}
            disabled={!draft.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-signal text-white transition disabled:opacity-30"
            title="Send"
          >
            <Send className="h-5 w-5" />
          </motion.button>
        </form>
        </>
        )}
      </div>

      <AnimatePresence>
        {reporting && (
          <ReportDialog
            key="report"
            name={person.name}
            onClose={() => setReporting(false)}
            onSubmit={async (reason, note) => {
              const supabase = createClient();
              const { error } = await supabase.rpc("report_user", { target: person.id, reason, note });
              setReporting(false);
              setNotice(error ? "Couldn’t send the report — try again." : "Report sent to a moderator.");
            }}
          />
        )}
        {editing && (
          <PersonEditor
            key="editor"
            personId={person.id}
            realName={person.name}
            realColor={person.color}
            onSave={(patch) => {
              setOverride(person.id, patch);
              setEditing(false);
            }}
            onReset={() => {
              clearOverride(person.id);
              setEditing(false);
            }}
            onClose={() => setEditing(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PersonEditor({
  personId,
  realName,
  realColor,
  onSave,
  onReset,
  onClose,
}: {
  personId: string;
  realName: string;
  realColor: string;
  onSave: (patch: { name?: string; color?: string }) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const { overrides } = useOverrides();
  const current = overrides[personId] ?? {};
  const [name, setName] = useState(current.name ?? "");
  const [color, setColor] = useState(current.color ?? realColor);
  const initials = initialsOf(name.trim() || realName);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="w-[360px] rounded-card border border-line bg-surface p-6 shadow-2xl"
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 12 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="u-label text-ink-soft">Edit how they appear</p>
          <button onClick={onClose} className="rounded-md p-1 text-ink-soft hover:bg-paper" aria-label="Close">
            <Close className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-5 flex items-center gap-3">
          <Avatar initials={initials} color={color} size="lg" />
          <div className="min-w-0">
            <p className="font-display text-lg font-bold">{name.trim() || realName}</p>
            <p className="font-mono text-[0.65rem] text-ink-soft">
              Only you see this · really {realName}
            </p>
          </div>
        </div>

        <label className="mb-1.5 block text-sm font-semibold">Nickname</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={realName}
          className="mb-4 w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-signal"
        />

        <label className="mb-1.5 block text-sm font-semibold">Icon color</label>
        <div className="mb-6 flex flex-wrap gap-2">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Use ${c}`}
              className={`h-8 w-8 rounded-full transition ${
                color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onSave({ name: name.trim() || undefined, color })}
            className="flex-1 rounded-full bg-live px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            Save
          </button>
          <button
            onClick={onReset}
            className="rounded-full border border-line px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-paper"
          >
            Reset
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Bubble({
  m,
  person,
  prev,
}: {
  m: Message;
  person: { initials: string; color: string };
  prev?: Message;
}) {
  const mine = m.authorId === "me";

  if (m.kind === "missed-call") {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className="flex justify-center py-2"
      >
        <span className="flex items-center gap-2 rounded-full bg-alert/10 px-3 py-1.5 font-mono text-xs text-alert">
          <Phone className="h-3.5 w-3.5" /> Missed call · {clockTime(m.sentAt)}
        </span>
      </motion.div>
    );
  }

  const grouped = prev && prev.authorId === m.authorId && prev.kind !== "missed-call";

  return (
    <motion.div
      layout
      initial={mine ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 500, damping: 34 }}
      className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${grouped ? "mt-0.5" : "mt-3"}`}
    >
      <div className="w-8 shrink-0">
        {!mine && !grouped && <Avatar initials={person.initials} color={person.color} size="sm" />}
      </div>
      <div className={`flex max-w-[62%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {m.kind === "image" ? (
          m.imageUrl ? (
            <a
              href={m.imageUrl}
              target="_blank"
              rel="noreferrer"
              className={`block overflow-hidden rounded-2xl bg-line ${isExpiring(m.expiresInHours) ? "expiring" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs */}
              <img src={m.imageUrl} alt="Shared image" className="max-h-72 max-w-[260px] object-cover" />
            </a>
          ) : (
            <div className="flex h-44 w-60 items-center justify-center rounded-2xl bg-line font-mono text-xs text-ink-soft">
              image unavailable
            </div>
          )
        ) : (
          <motion.div
            layout
            layoutId={mine ? `bubble-${m.id}` : undefined}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
              mine ? "bg-signal text-white" : "bg-surface text-ink shadow-sm"
            } ${isExpiring(m.expiresInHours) ? "expiring" : ""}`}
          >
            {m.body}
          </motion.div>
        )}
        <div className="mt-1 flex items-center gap-2 px-1">
          <span className="font-mono text-[0.65rem] text-ink-soft">{clockTime(m.sentAt)}</span>
          <span
            className={`font-mono text-[0.65rem] ${
              isExpiring(m.expiresInHours) ? "text-alert" : "text-ink-soft/60"
            }`}
          >
            {expiryLabel(m.expiresInHours)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function CannotMessage({
  name,
  blocked,
  connected,
  onUnblock,
}: {
  name: string;
  blocked: boolean;
  connected: boolean;
  onUnblock: () => void;
}) {
  const first = name.split(" ")[0];
  return (
    <div className="flex items-center justify-center gap-3 py-1.5 text-sm text-ink-soft">
      {blocked ? (
        <>
          <span>You blocked {first}.</span>
          <button onClick={onUnblock} className="font-semibold text-signal-ink hover:underline">
            Unblock
          </button>
        </>
      ) : !connected ? (
        <>
          <span>You&apos;re not connected with {first} yet.</span>
          <Link href="/connections" className="inline-flex items-center gap-1.5 font-semibold text-signal-ink hover:underline">
            <Users className="h-4 w-4" /> Connections
          </Link>
        </>
      ) : (
        <span>You can&apos;t message {first} right now.</span>
      )}
    </div>
  );
}

function ReportDialog({
  name,
  onClose,
  onSubmit,
}: {
  name: string;
  onClose: () => void;
  onSubmit: (reason: string, note: string) => Promise<void>;
}) {
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="w-[380px] rounded-card border border-line bg-surface p-6 shadow-2xl"
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 12 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="u-label text-ink-soft">Report {name}</p>
          <button onClick={onClose} className="rounded-md p-1 text-ink-soft hover:bg-paper" aria-label="Close">
            <Close className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-ink-soft">
          A moderator will see your note and the last 20 messages of this chat.
        </p>

        <div className="mb-4 space-y-1.5">
          {REPORT_REASONS.map((r) => (
            <label
              key={r}
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${
                reason === r ? "border-signal bg-signal/5" : "border-line hover:bg-paper"
              }`}
            >
              <input
                type="radio"
                name="reason"
                checked={reason === r}
                onChange={() => setReason(r)}
                className="accent-[var(--color-signal)]"
              />
              {r}
            </label>
          ))}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Anything else the moderator should know? (optional)"
          className="mb-5 w-full resize-none rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-signal"
        />

        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onSubmit(reason, note.trim());
          }}
          className="w-full rounded-full bg-alert px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send report"}
        </button>
      </motion.div>
    </motion.div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
        primary ? "bg-signal text-white hover:brightness-110" : "text-ink-soft hover:bg-paper"
      }`}
    >
      {children}
    </button>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-paper ${
        danger ? "text-alert" : "text-ink"
      }`}
    >
      {children}
    </button>
  );
}
