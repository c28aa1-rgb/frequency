"use client";

import { useState, useEffect } from "react";
import { AVATAR_COLORS, initialsOf } from "@/lib/mock";
import { Avatar } from "@/components/Avatar";
import { useDirectory } from "@/components/DirectoryProvider";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const { me, refresh } = useDirectory();
  const [color, setColor] = useState("#3a66ff");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (me) setColor(me.color);
  }, [me]);

  const initials = initialsOf(me?.name ?? "You");

  async function save() {
    if (!me) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from("profiles").update({ color }).eq("id", me.id);
    await refresh();
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="flex-1 overflow-y-auto bg-paper">
      <div className="mx-auto max-w-xl px-8 py-10">
        <p className="u-label text-ink-soft">Your profile</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold text-ink">How you show up</h1>
        <p className="mt-2 text-ink-soft">
          Your name comes from your Google account and can&apos;t be changed —
          that keeps everyone accountable. You can recolor your own icon.
        </p>

        <div className="mt-8 rounded-card border border-line bg-surface p-7">
          <div className="flex items-center gap-4">
            <Avatar initials={initials} color={color} size="xl" presence="online" />
            <div>
              <p className="font-display text-xl font-bold">{me?.name ?? "…"}</p>
              <p className="font-mono text-xs text-ink-soft">{me?.email ?? ""}</p>
            </div>
          </div>

          <hr className="my-6 border-line" />

          <div className="mb-5">
            <div className="mb-1.5 flex items-baseline justify-between">
              <label className="text-sm font-semibold text-ink">Name</label>
              <span className="font-mono text-[0.65rem] text-ink-soft">🔒 from Google</span>
            </div>
            <div className="w-full cursor-not-allowed rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm text-ink-soft">
              {me?.name ?? "…"}
            </div>
          </div>

          <div className="mb-2">
            <label className="mb-1.5 block text-sm font-semibold text-ink">Your icon color</label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { setColor(c); setSaved(false); }}
                  className={`h-9 w-9 rounded-full transition ${
                    color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Use ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="mt-7 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving || !me}
              className="rounded-full bg-live px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {saved && <span className="font-mono text-xs text-live">✓ Saved</span>}
          </div>
        </div>

        <p className="mt-4 text-center font-mono text-xs text-ink-soft">
          Want to personalize someone else? Open their chat and tap their name to set a private nickname &amp; color.
        </p>
      </div>
    </div>
  );
}
