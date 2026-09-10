import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type PendingRequest = {
  id: string;
  user_id: string;
  trip_group_id: string;
  stop_order: number;
  site_name: string;
  location: string;
  contact_person: string | null;
  contact_phone: string | null;
  purpose: string | null;
  notes: string | null;
  planned_at: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  visit_status: "not_started" | "in_progress" | "completed";
  profiles: { full_name: string | null } | null;
};

const VISIT_STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  in_progress: { label: "Visit in progress", bg: "bg-primary/10", text: "text-primary" },
  completed: { label: "Visit completed", bg: "bg-success/10", text: "text-success" },
};

/** Groups pending request rows that belong to the same trip (same
 * trip_group_id — one "Request Site Visit" submission can cover several
 * stops), ordered by stop_order within a group, groups newest-first. */
function groupRequests(requests: PendingRequest[]): PendingRequest[][] {
  const byGroup = new Map<string, PendingRequest[]>();
  for (const r of requests) {
    const arr = byGroup.get(r.trip_group_id) ?? [];
    arr.push(r);
    byGroup.set(r.trip_group_id, arr);
  }
  const groups = Array.from(byGroup.values()).map((g) => [...g].sort((a, b) => a.stop_order - b.stop_order));
  groups.sort((a, b) => new Date(b[0].created_at).getTime() - new Date(a[0].created_at).getTime());
  return groups;
}

/**
 * Team-head-facing panel: lists pending site visit requests from the
 * signed-in user's team (RLS via can_view_sales_tracker_of already scopes
 * this to "my team + me" for managers, and "everyone" for admins) and lets
 * them Approve or Reject a whole trip (all its stops) at once. Approving
 * here does NOT create the site_visits rows — that happens when the rep
 * clicks "Start Visit" on their own approved request card.
 */
export default function SiteVisitApprovals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rejectingGroup, setRejectingGroup] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["site-visit-requests", "pending-approvals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_visit_requests")
        .select(
          "id, user_id, trip_group_id, stop_order, site_name, location, contact_person, contact_phone, purpose, notes, planned_at, status, created_at, visit_status, profiles!site_visit_requests_user_id_fkey(full_name)"
        )
        .eq("status", "pending")
        .order("planned_at", { ascending: true });
      if (error) throw error;
      return data as unknown as PendingRequest[];
    },
    enabled: !!user,
  });

  const groups = useMemo(() => groupRequests(requests), [requests]);

  const decide = useMutation({
    mutationFn: async ({ tripGroupId, status, decisionNote }: { tripGroupId: string; status: "approved" | "rejected"; decisionNote?: string }) => {
      const { error } = await supabase
        .from("site_visit_requests")
        .update({
          status,
          decided_by: user!.id,
          decided_at: new Date().toISOString(),
          decision_note: decisionNote?.trim() || null,
        })
        .eq("trip_group_id", tripGroupId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["site-visit-requests"] });
      toast.success(variables.status === "approved" ? "Request approved" : "Request rejected");
      setRejectingGroup(null);
      setReason("");
    },
    onError: () => toast.error("Couldn't save your decision. Please try again."),
  });

  if (isLoading) return null;

  return (
    <div className="rounded-card border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold text-ink-primary">Site visit approvals</h2>
        {groups.length > 0 && (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {groups.length} pending
          </span>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Clock className="h-8 w-8 text-ink-muted" />
          <p className="text-sm text-ink-muted">No pending requests right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const primary = group[0];
            return (
              <div key={primary.trip_group_id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink-primary">
                      {primary.profiles?.full_name ?? "A team member"} →{" "}
                      {group.length > 1 ? `${group.length} sites` : primary.site_name}
                    </p>
                    {group.length === 1 && <p className="text-sm text-ink-muted">{primary.location}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                      Planned {format(new Date(primary.planned_at), "d MMM, h:mm a")}
                    </span>
                    {VISIT_STATUS_META[primary.visit_status] && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${VISIT_STATUS_META[primary.visit_status].bg} ${VISIT_STATUS_META[primary.visit_status].text}`}
                      >
                        {VISIT_STATUS_META[primary.visit_status].label}
                      </span>
                    )}
                  </div>
                </div>

                {group.length > 1 ? (
                  <div className="mt-2 space-y-2 border-l border-border pl-3">
                    {group.map((stop, i) => (
                      <div key={stop.id} className="text-sm">
                        <p className="font-medium text-ink-primary">{i + 1}. {stop.site_name}</p>
                        <p className="text-xs text-ink-muted">{stop.location}</p>
                        {(stop.contact_person || stop.contact_phone) && (
                          <p className="text-xs text-ink-muted">
                            {stop.contact_person}{stop.contact_person && stop.contact_phone ? " · " : ""}{stop.contact_phone}
                          </p>
                        )}
                        {stop.purpose && <p className="text-xs text-ink-muted">Purpose: {stop.purpose}</p>}
                        {stop.notes && <p className="text-xs text-ink-muted">Notes: {stop.notes}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-ink-muted sm:grid-cols-2">
                    {primary.contact_person && <p>Contact: {primary.contact_person}</p>}
                    {primary.contact_phone && <p>Phone: {primary.contact_phone}</p>}
                    {primary.purpose && <p className="sm:col-span-2">Purpose: {primary.purpose}</p>}
                    {primary.notes && <p className="sm:col-span-2">Notes: {primary.notes}</p>}
                  </div>
                )}

                {rejectingGroup === primary.trip_group_id ? (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for rejecting (optional)"
                      rows={2}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setRejectingGroup(null);
                          setReason("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ tripGroupId: primary.trip_group_id, status: "rejected", decisionNote: reason })}
                      >
                        Confirm reject
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-1.5"
                      disabled={decide.isPending}
                      onClick={() => setRejectingGroup(primary.trip_group_id)}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      type="button"
                      className="gap-1.5"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ tripGroupId: primary.trip_group_id, status: "approved" })}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </Button>
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
