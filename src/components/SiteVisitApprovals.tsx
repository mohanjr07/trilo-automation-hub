import { useState } from "react";
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
  site_name: string;
  location: string;
  contact_person: string | null;
  contact_phone: string | null;
  purpose: string | null;
  notes: string | null;
  planned_at: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  profiles: { full_name: string | null } | null;
};

/**
 * Team-head-facing panel: lists pending site visit requests from the
 * signed-in user's team (RLS via can_view_sales_tracker_of already scopes
 * this to "my team + me" for managers, and "everyone" for admins) and lets
 * them Approve or Reject. Approving here does NOT create the site_visits
 * row — that happens when the rep clicks "Start Visit" on their own
 * pending-request card, once it's due.
 */
export default function SiteVisitApprovals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["site-visit-requests", "pending-approvals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_visit_requests")
        .select(
          "id, user_id, site_name, location, contact_person, contact_phone, purpose, notes, planned_at, status, created_at, profiles!site_visit_requests_user_id_fkey(full_name)"
        )
        .eq("status", "pending")
        .order("planned_at", { ascending: true });
      if (error) throw error;
      return data as unknown as PendingRequest[];
    },
    enabled: !!user,
  });

  const decide = useMutation({
    mutationFn: async ({ id, status, decisionNote }: { id: string; status: "approved" | "rejected"; decisionNote?: string }) => {
      const { error } = await supabase
        .from("site_visit_requests")
        .update({
          status,
          decided_by: user!.id,
          decided_at: new Date().toISOString(),
          decision_note: decisionNote?.trim() || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["site-visit-requests"] });
      toast.success(variables.status === "approved" ? "Request approved" : "Request rejected");
      setRejectingId(null);
      setReason("");
    },
    onError: () => toast.error("Couldn't save your decision. Please try again."),
  });

  if (isLoading) return null;

  return (
    <div className="rounded-card border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold text-ink-primary">Site visit approvals</h2>
        {requests.length > 0 && (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {requests.length} pending
          </span>
        )}
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Clock className="h-8 w-8 text-ink-muted" />
          <p className="text-sm text-ink-muted">No pending requests right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink-primary">
                    {req.profiles?.full_name ?? "A team member"} → {req.site_name}
                  </p>
                  <p className="text-sm text-ink-muted">{req.location}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                  Planned {format(new Date(req.planned_at), "d MMM, h:mm a")}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-ink-muted sm:grid-cols-2">
                {req.contact_person && <p>Contact: {req.contact_person}</p>}
                {req.contact_phone && <p>Phone: {req.contact_phone}</p>}
                {req.purpose && <p className="sm:col-span-2">Purpose: {req.purpose}</p>}
                {req.notes && <p className="sm:col-span-2">Notes: {req.notes}</p>}
              </div>

              {rejectingId === req.id ? (
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
                        setRejectingId(null);
                        setReason("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: req.id, status: "rejected", decisionNote: reason })}
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
                    onClick={() => setRejectingId(req.id)}
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    type="button"
                    className="gap-1.5"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: req.id, status: "approved" })}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
