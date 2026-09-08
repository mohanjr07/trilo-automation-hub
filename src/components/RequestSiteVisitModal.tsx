import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus } from "lucide-react";
import { addHours, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import LocationAutocompleteInput from "@/components/LocationAutocompleteInput";
import { toast } from "sonner";

type FormState = {
  siteName: string;
  location: string;
  contactPerson: string;
  contactPhone: string;
  purpose: string;
  notes: string;
  plannedAt: string; // value of an <input type="datetime-local">
};

const emptyForm = (): FormState => ({
  siteName: "",
  location: "",
  contactPerson: "",
  contactPhone: "",
  purpose: "",
  notes: "",
  plannedAt: "",
});

// Earliest a rep is allowed to pick, formatted for <input type="datetime-local">.
// A little padding (a minute) so the exact 24h boundary doesn't get rejected
// by the server-side trigger due to the few seconds elapsed while submitting.
function minPlannedAtLocalValue() {
  const min = addHours(new Date(), 24);
  min.setMinutes(min.getMinutes() + 1);
  return format(min, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Replaces the old instant "New Site Visit" flow. A sales rep can no longer
 * start a visit on the spot — they request one here (planned date/time must
 * be at least 24 hours out), their team lead approves or rejects it, and
 * only an approved request becomes startable on the Sales Tracker page.
 */
export default function RequestSiteVisitModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));
  const reset = () => setForm(emptyForm());

  const submit = useMutation({
    mutationFn: async () => {
      const plannedAtIso = new Date(form.plannedAt).toISOString();
      const { error } = await supabase.from("site_visit_requests").insert({
        user_id: user!.id,
        site_name: form.siteName.trim(),
        location: form.location.trim(),
        contact_person: form.contactPerson.trim() || null,
        contact_phone: form.contactPhone.trim() || null,
        purpose: form.purpose.trim() || null,
        notes: form.notes.trim() || null,
        planned_at: plannedAtIso,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-visit-requests"] });
      toast.success("Request sent — your team lead has been notified.");
      reset();
      onClose();
    },
    onError: (err: unknown) => {
      // Surface the 24-hour-ahead trigger's message if that's what failed.
      const message = err instanceof Error ? err.message : "";
      if (message.includes("24 hours")) {
        toast.error("Site visits must be requested at least 24 hours in advance");
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
                if (!form.siteName.trim() || !form.location.trim()) {
                  toast.error("Site name and location are required");
                  return;
                }
                if (!form.plannedAt) {
                  toast.error("Pick a planned visit date and time");
                  return;
                }
                const plannedDate = new Date(form.plannedAt);
                if (plannedDate.getTime() < addHours(new Date(), 24).getTime()) {
                  toast.error("Site visits must be requested at least 24 hours in advance");
                  return;
                }
                submit.mutate();
              }}
              className="space-y-4"
            >
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">Site / Client name *</label>
                  <Input value={form.siteName} onChange={(e) => update({ siteName: e.target.value })} autoFocus />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">Location / Address *</label>
                  <LocationAutocompleteInput value={form.location} onChange={(v) => update({ location: v })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink-primary">Contact person</label>
                    <Input value={form.contactPerson} onChange={(e) => update({ contactPerson: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink-primary">Contact phone</label>
                    <Input value={form.contactPhone} onChange={(e) => update({ contactPhone: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">Purpose of visit</label>
                  <Input value={form.purpose} onChange={(e) => update({ purpose: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">Notes</label>
                  <Textarea value={form.notes} onChange={(e) => update({ notes: e.target.value })} rows={2} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">Planned date & time *</label>
                  <Input
                    type="datetime-local"
                    value={form.plannedAt}
                    min={minPlannedAtLocalValue()}
                    onChange={(e) => update({ plannedAt: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-ink-muted">Must be at least 24 hours from now.</p>
                </div>
              </div>

              <p className="text-xs text-ink-muted">
                Your team lead will be notified and needs to approve this before you can start the visit.
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
