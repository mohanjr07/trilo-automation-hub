// ─────────────────────────────────────────────────────────────────────────────
//  "Workflow people" — who does which job in the approval flows.
//  Admins set them in Settings → Workflow people (table public.workflow_people),
//  so nothing is hard-coded to a person. The database functions read the same table.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WorkflowRole = "form_approver" | "accounts" | "qc_approver" | "authorizer" | "ot_approver";
export type WorkflowPerson = { id: string; full_name: string; email: string };

export const WORKFLOW_ROLES: { key: WorkflowRole; label: string; help: string; multi: boolean }[] = [
  { key: "form_approver", label: "Form approver", multi: false,
    help: "Approves submitted forms first (\"Approved by\"), before the authorizer." },
  { key: "authorizer", label: "Form authorizers", multi: true,
    help: "People the requester can choose in \"Authorized by\" — the final sign-off on forms." },
  { key: "qc_approver", label: "Quality check approvers", multi: true,
    help: "Approve Quality Check / Design Validation forms (the requester picks one)." },
  { key: "accounts", label: "Accounts", multi: false,
    help: "Approves Asset / Expense / Vendor Registration forms, pays approved payments (uploads the receipt) and receives approved overtime." },
  { key: "ot_approver", label: "Overtime approver", multi: false,
    help: "Approves overtime entered by managers before it goes to Accounts." },
];

export const ROLE_LABEL: Record<WorkflowRole, string> = Object.fromEntries(WORKFLOW_ROLES.map((r) => [r.key, r.label])) as any;

// Last loaded assignment — lets plain helpers (Word export, labels) use it without a hook.
let current: Partial<Record<WorkflowRole, WorkflowPerson[]>> = {};
export const workflowPeople = (role: WorkflowRole): WorkflowPerson[] => current[role] ?? [];
export const workflowName = (role: WorkflowRole) => workflowPeople(role)[0]?.full_name ?? ROLE_LABEL[role];

export function useWorkflowPeople() {
  const { data, isLoading } = useQuery({
    queryKey: ["workflow-people"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("workflow_people")
        .select("role_key, user_id, profile:profiles(id, full_name, email, is_active)")
        .order("created_at");
      if (error) throw error;
      const out: Partial<Record<WorkflowRole, WorkflowPerson[]>> = {};
      for (const r of data ?? []) {
        if (!r.profile || r.profile.is_active === false) continue;
        (out[r.role_key as WorkflowRole] ??= []).push({ id: r.profile.id, full_name: r.profile.full_name, email: r.profile.email });
      }
      current = out;
      return out;
    },
  });
  const byRole = data ?? current;
  const people = (role: WorkflowRole) => byRole[role] ?? [];
  return {
    loading: isLoading,
    people,
    first: (role: WorkflowRole) => people(role)[0] ?? null,
    has: (role: WorkflowRole, userId?: string | null) => !!userId && people(role).some((p) => p.id === userId),
    name: (role: WorkflowRole) => people(role)[0]?.full_name ?? ROLE_LABEL[role],
  };
}
