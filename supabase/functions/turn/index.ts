// Supabase Edge Function: returns ICE servers (STUN + TURN) for WebRTC calls.
// The Metered key stays here as a function secret; the browser only ever sees
// the short-lived TURN credentials. Signed-in users only.
//
// Deploy:  npx supabase functions deploy turn --no-verify-jwt --project-ref <ref>
// Secrets: npx supabase secrets set METERED_API_KEY=... METERED_TURN_DOMAIN=... --project-ref <ref>
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Always available, no credentials needed — enough for same-network calls.
const STUN_FALLBACK = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // We verify the caller ourselves (deployed with --no-verify-jwt) so this
  // works with both legacy and new Supabase API keys.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return json({ error: "sign in first" }, 401);

  const domain = Deno.env.get("METERED_TURN_DOMAIN");
  const apiKey = Deno.env.get("METERED_API_KEY");
  if (!domain || !apiKey) return json(STUN_FALLBACK);

  try {
    const res = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`);
    if (!res.ok) throw new Error(`Metered responded ${res.status}`);
    return json(await res.json());
  } catch {
    // Metered unreachable — still let calls work on the same network.
    return json(STUN_FALLBACK);
  }
});
