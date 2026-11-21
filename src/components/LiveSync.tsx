// ─────────────────────────────────────────────────────────────────────────────
//  Live updates without polling.
//  Every device keeps ONE realtime connection to the database. When any row
//  changes (new task, form approved, payment paid…), the screens refresh within
//  about a second. This replaces the old "refresh every 5 seconds", which sent
//  so many requests through the website relay that it hit Cloudflare's daily
//  limit and requests started failing ("Failed to fetch").
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export default function LiveSync() {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let timer: number | undefined;
    let pending = false;
    const run = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "form-template" });
    const refresh = () => {
      // app in the background → do nothing now, refresh once when it comes back
      if (document.hidden) { pending = true; return; }
      window.clearTimeout(timer);
      // a burst of changes → one refresh; Word templates are never re-downloaded
      timer = window.setTimeout(run, 1500);
    };
    const onVisible = () => { if (!document.hidden && pending) { pending = false; run(); } };
    document.addEventListener("visibilitychange", onVisible);
    const channel = supabase
      .channel(`live-sync-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public" }, refresh)
      .subscribe();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [qc, user]);

  return null;
}
