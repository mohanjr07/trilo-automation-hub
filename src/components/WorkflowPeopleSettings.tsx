// Settings → Workflow people: admins choose who approves forms, authorizes, pays, approves overtime…
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WORKFLOW_ROLES, useWorkflowPeople, type WorkflowRole } from "@/lib/workflowPeople";
import { toast } from "sonner";

type Person = { id: string; full_name: string };

export default function WorkflowPeopleSettings() {
  const qc = useQueryClient();
  const wp = useWorkflowPeople();
  const [adding, setAdding] = useState<Record<string, string>>({});

  const { data: people = [] } = useQuery({
    queryKey: ["form-people"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_active_profiles");
      if (error) throw error;
      return ((data ?? []) as Person[]).sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["workflow-people"] }); qc.invalidateQueries({ queryKey: ["pending-counts"] }); };

  const add = useMutation({
    mutationFn: async ({ role, userId, multi }: { role: WorkflowRole; userId: string; multi: boolean }) => {
      if (!multi) {
        const { error: delErr } = await (supabase as any).from("workflow_people").delete().eq("role_key", role);
        if (delErr) throw delErr;
      }
      const { error } = await (supabase as any).from("workflow_people").insert({ role_key: role, user_id: userId });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { setAdding((a) => ({ ...a, [v.role]: "" })); refresh(); toast.success("Saved"); },
    onError: (e: any) => toast.error("Could not save: " + (e?.message ?? "")),
  });
  const remove = useMutation({
    mutationFn: async ({ role, userId }: { role: WorkflowRole; userId: string }) => {
      const { error } = await (supabase as any).from("workflow_people").delete().eq("role_key", role).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Removed"); },
    onError: (e: any) => toast.error("Could not remove: " + (e?.message ?? "")),
  });

  return (
    <div className="rounded-card bg-card p-4 sm:p-6 shadow-card">
      <h2 className="font-heading text-lg font-bold text-ink-primary">Workflow people</h2>
      <p className="mb-5 text-sm text-ink-muted">Who approves, authorizes and pays. Forms, Payments and Overtime use these people.</p>
      {wp.loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-ink-muted" /></div>
      ) : (
        <div className="space-y-5">
          {WORKFLOW_ROLES.map((r) => {
            const current = wp.people(r.key);
            const choices = people.filter((p) => !current.some((c) => c.id === p.id));
            return (
              <div key={r.key} className="border-b border-border pb-5 last:border-0 last:pb-0">
                <p className="text-sm font-semibold text-ink-primary">{r.label}</p>
                <p className="mb-2 text-xs text-ink-muted">{r.help}</p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {current.length ? current.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-sm text-ink-primary">
                      {p.full_name}
                      <button type="button" onClick={() => remove.mutate({ role: r.key, userId: p.id })}
                        className="text-ink-muted hover:text-destructive" aria-label={`Remove ${p.full_name}`}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )) : <span className="text-sm text-warning">Not set yet</span>}
                </div>
                {(
                  <div className="flex gap-2">
                    <select value={adding[r.key] ?? ""} onChange={(e) => setAdding((a) => ({ ...a, [r.key]: e.target.value }))}
                      className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm">
                      <option value="">{r.multi ? "Add a person…" : current.length ? "Change to…" : "Choose a person…"}</option>
                      {choices.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                    <button type="button" disabled={!adding[r.key] || add.isPending}
                      onClick={() => add.mutate({ role: r.key, userId: adding[r.key], multi: r.multi })}
                      className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
                      <Plus className="h-4 w-4" /> {r.multi ? "Add" : "Set"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
