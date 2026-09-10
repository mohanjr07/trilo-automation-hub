import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LocationAutocompleteInput from "@/components/LocationAutocompleteInput";
import { toast } from "sonner";

const PURPOSE_OPTIONS = [
  "Requirement gathering",
  "Technical discussion",
  "Negotiation or closure",
  "Customer issue",
  "Follow up",
] as const;

type SiteStop = {
  siteName: string;
  location: string;
  personToMeet: string;
  contactPhone: string;
  purpose: string;
  notes: string;
};

const emptyStop = (): SiteStop => ({ siteName: "", location: "", personToMeet: "", contactPhone: "", purpose: "", notes: "" });

// Earliest a rep is allowed to pick, formatted for <input type="datetime-local">.
// Same-day visits are allowed now — they'll just show as "pending" (orange)
// on the calendar until a team lead approves them. Only the past is blocked.
function minPlannedAtLocalValue() {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm");
}

/**
 * A sales rep requests approval for a site visit here. Same-day visits are
 * allowed (shown pending/orange on the calendar until approved); a visit
 * planned for tomorrow or later also needs the team lead's approval before
 * it becomes startable, and shows approved/green once granted.
 *
 * Supports multiple stops in one trip (e.g. Client A -> Client B -> Client
 * C) — all stops share the same planned date/time and are
 * approved/rejected together as a group.
 */
export default function RequestSiteVisitModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sites, setSites] = useState<SiteStop[]>([emptyStop()]);
  const [plannedAt, setPlannedAt] = useState("");

  const reset = () => {
    setSites([emptyStop()]);
    setPlannedAt("");
  };

  const updateStop = (index: number, patch: Partial<SiteStop>) => {
    setSites((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };
  const addStop = () => setSites((prev) => [...prev, emptyStop()]);
  const removeStop = (index: number) => setSites((prev) => prev.filter((_, i) => i !== index));

  const submit = useMutation({
    mutationFn: async () => {
      const plannedAtIso = new Date(plannedAt).toISOString();
      const tripGroupId = crypto.randomUUID();
      const rows = sites.map((s, i) => ({
        user_id: user!.id,
        trip_group_id: tripGroupId,
        stop_order: i + 1,
        site_name: s.siteName.trim(),
        location: s.location.trim(),
        contact_person: s.personToMeet.trim() || null,
        contact_phone: s.contactPhone.trim() || null,
        purpose: s.purpose || null,
        notes: s.notes.trim() || null,
        planned_at: plannedAtIso,
      }));
      const { error } = await supabase.from("site_visit_requests").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-visit-requests"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-site-visits"] });
      toast.success("Request sent — your team lead has been notified.");
      reset();
      onClose();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "";
      if (message.toLowerCase().includes("past")) {
        toast.error("Planned visit date can't be in the past");
      } else {
        toast.error("Couldn't send the request");
      }
    },
  });

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-ink-primary/30"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative w-full md:max-w-[560px] max-h-[92vh] overflow-y-auto rounded-t-modal md:rounded-modal bg-card p-5 sm:p-6 shadow-modal"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-xl font-bold text-ink-primary">Request Site Visit</h2>
              <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const incomplete = sites.some((s) => !s.siteName.trim() || !s.location.trim());
                if (incomplete) {
                  toast.error("Site name and location are required for every site");
                  return;
                }
                if (!plannedAt) {
                  toast.error("Pick a planned visit date and time");
                  return;
                }
                const plannedDate = new Date(plannedAt);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (plannedDate < today) {
                  toast.error("Planned visit date can't be in the past");
                  return;
                }
                submit.mutate();
              }}
              className="space-y-5"
            >
              {sites.map((stop, index) => (
                <div key={index} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-ink-primary">Site {index + 1}</p>
                    {sites.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStop(index)}
                        className="text-ink-muted hover:text-destructive"
                        aria-label={`Remove site ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink-primary">Site / Client name *</label>
                    <Input
                      value={stop.siteName}
                      onChange={(e) => updateStop(index, { siteName: e.target.value })}
                      autoFocus={index === 0}
                      placeholder="e.g. Acme Pvt Ltd"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink-primary">Location / Address *</label>
                    <LocationAutocompleteInput value={stop.location} onChange={(v) => updateStop(index, { location: v })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink-primary">Person to meet</label>
                      <Input value={stop.personToMeet} onChange={(e) => updateStop(index, { personToMeet: e.target.value })} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink-primary">Contact phone</label>
                      <Input value={stop.contactPhone} onChange={(e) => updateStop(index, { contactPhone: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink-primary">Purpose of visit</label>
                    <Select value={stop.purpose} onValueChange={(v) => updateStop(index, { purpose: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {PURPOSE_OPTIONS.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink-primary">Notes</label>
                    <Textarea value={stop.notes} onChange={(e) => updateStop(index, { notes: e.target.value })} rows={2} />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addStop}
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Plus className="h-4 w-4" /> Add another site
              </button>

              <div className="rounded-lg border border-border p-4">
                <label className="mb-1.5 block text-sm font-medium text-ink-primary">Planned date & time *</label>
                <Input
                  type="datetime-local"
                  value={plannedAt}
                  min={minPlannedAtLocalValue()}
                  onChange={(e) => setPlannedAt(e.target.value)}
                />
                <p className="mt-1 text-xs text-ink-muted">
                  Applies to the whole trip — all sites above are one request. Today is allowed (shows as pending
                  until approved); a future date also needs approval before you can start the visit.
                </p>
              </div>

              <p className="text-xs text-ink-muted">
                Your team lead will be notified and needs to approve this visit.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submit.isPending} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  {submit.isPending ? "Sending..." : "Send request"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
