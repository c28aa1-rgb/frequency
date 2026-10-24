// Deletes chat images older than 3 days. Messages themselves are purged by a
// pg_cron job in the database (supabase/features.sql), which also makes their
// images unreadable — but Storage files can't be deleted from SQL, so this runs
// on a schedule from GitHub Actions (.github/workflows/cleanup.yml).
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await admin.rpc("expired_chat_images");
if (error) throw error;

const names = data ?? [];
for (let i = 0; i < names.length; i += 100) {
  const { error: removeError } = await admin.storage.from("chat-images").remove(names.slice(i, i + 100));
  if (removeError) throw removeError;
}
console.log(`Removed ${names.length} expired image(s).`);
