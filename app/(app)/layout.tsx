"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { CallProvider } from "@/components/call/CallProvider";
import { OverridesProvider } from "@/components/OverridesProvider";
import { DirectoryProvider } from "@/components/DirectoryProvider";
import { DisabledNotice } from "@/components/DisabledNotice";
import { createClient } from "@/lib/supabase/client";

// Static site, so the sign-in check happens in the browser. Data is still
// protected by Supabase RLS; this only decides what to render.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ok" | "disabled">("checking");

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("disabled")
        .eq("id", user.id)
        .maybeSingle();
      setState(profile?.disabled ? "disabled" : "ok");
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (state === "checking") return null;
  if (state === "disabled") return <DisabledNotice />;

  return (
    <DirectoryProvider>
      <OverridesProvider>
        <CallProvider>
          <div className="flex h-screen overflow-hidden">
            <Suspense>
              <Sidebar />
            </Suspense>
            <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
          </div>
        </CallProvider>
      </OverridesProvider>
    </DirectoryProvider>
  );
}
