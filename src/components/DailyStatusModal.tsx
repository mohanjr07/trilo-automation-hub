import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, MapPin, Palmtree } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const today = () => format(new Date(), "yyyy-MM-dd");

type Status = "office" | "site" | "leave";

const STATUS_OPTIONS: { value: Status; label: string; icon: typeof Building2; description: string }[] = [
  { value: "office", label: "In Office", icon: Building2, description: "Working from the office today" },
  { value: "site", label: "On Site", icon: MapPin, description: "Visiting a client / site today" },
  { value: "leave", label: "Leave", icon: Palmtree, description: "On leave today" },
];

/**
 * Shown once per day, right after login. Every signed-in user picks one of
 * In Office / On Site / Leave; picking On Site also captures the visit
 * details up front. Their manager (or admins, if they have none) gets a
 * notification automatically via a DB trigger.
 */
export default function DailyStatusModal() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"pick" | "site-details">("pick");
  const [siteName, setSiteName] = useState("");
  const [location, setLocation] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [kmStart, setKmStart] = useState("");
  const [dismissed, setDismissed] = useState(false);

  // Only people the admin has put in the "Sales" department get the daily
  // check-in prompt — everyone else's login is unaffected.
  const isSalesDept = (profile?.department ?? "").trim().toLowerCase() === "sales";

  const { data: existingStatus, isLoading } = useQuery({
    queryKey: ["daily-status-today", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_status")
        .select("id, status")
        .eq("user_id", user!.id)
        .eq("status_date", today())
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && isSalesDept,
  });

  useEffect(() => {
    // Reset local wizard state each time the modal is about to (re)appear.
    if (existingStatus) {
      setStep("pick");
      setSiteName("");
      setLocation("");
      setContactPerson("");
      setContactPhone("");
      setPurpose("");
      setNotes("");
      setKmStart("");
    }
  }, [existingStatus]);

  const open = isSalesDept && !isLoading && !!user && !!profile && !existingStatus && !dismissed;

  const submitStatus = useMutation({
    mutationFn: async (status: Status) => {
      const { data, error } = await supabase
        .from("daily_status")
        .insert({ user_id: user!.id, status_date: today(), status })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, status) => {
      queryClient.invalidateQueries({ queryKey: ["daily-status-today"] });
      queryClient.invalidateQueries({ queryKey: ["sales-tracker"] });
      if (status === "site") {
        setStep("site-details");
      } else {
        toast.success(status === "office" ? "Marked as In Office" : "Marked as On Leave");
        setDismissed(true);
      }
    },
    onError: () => toast.error("Couldn't save your status. Please try again."),
  });

  const submitSiteVisit = useMutation({
    mutationFn: async () => {
      const dailyStatusId = submitStatus.data?.id ?? existingStatus?.id;
      const km = kmStart.trim() ? parseFloat(kmStart) : null;
      const startingTrip = km != null && !isNaN(km);
      const { error } = await supabase.from("site_visits").insert({
        user_id: user!.id,
        daily_status_id: dailyStatusId,
        visit_date: today(),
        site_name: siteName.trim(),
        location: location.trim(),
        contact_person: contactPerson.trim() || null,
        contact_phone: contactPhone.trim() || null,
        purpose: purpose.trim() || null,
        notes: notes.trim() || null,
        // If the KM reading is entered right away, start the trip immediately
        // instead of leaving it "not started" — one less step for the user.
        ...(startingTrip
          ? { trip_status: "in_progress", km_start: km, started_at: new Date().toISOString() }
          : {}),
      });
      if (error) throw error;
      return { startingTrip };
    },
    onSuccess: ({ startingTrip }) => {
      queryClient.invalidateQueries({ queryKey: ["sales-tracker"] });
      queryClient.invalidateQueries({ queryKey: ["my-site-visits"] });
      toast.success(
        startingTrip
          ? "Trip started — your manager has been notified"
          : "Site visit logged — your manager has been notified"
      );
      setDismissed(true);
    },
    onError: () => toast.error("Couldn't save the site visit. Please try again."),
  });

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-ink-primary/40 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="relative w-full max-w-[480px] max-h-[90vh] overflow-y-auto rounded-modal bg-card p-6 shadow-modal mx-4"
        >
          {step === "pick" ? (
            <>
              <h2 className="font-heading text-xl font-bold text-ink-primary">Good day, {profile?.full_name?.split(" ")[0] ?? "there"} 👋</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Let your team head know where you'll be today ({format(new Date(), "EEEE, MMM d")}).
              </p>

              <div className="mt-5 grid grid-cols-1 gap-3">
                {STATUS_OPTIONS.map(({ value, label, icon: Icon, description }) => (
                  <button
                    key={value}
                    disabled={submitStatus.isPending}
                    onClick={() => submitStatus.mutate(value)}
                    className="flex items-center gap-3 rounded-lg border border-border p-4 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-ink-primary">{label}</p>
                      <p className="text-xs text-ink-muted">{description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 className="font-heading text-xl font-bold text-ink-primary">Site visit details</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Tell us where you're headed. You can start tracking your trip's KM from the Sales Tracker page any time.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!siteName.trim() || !location.trim()) {
                    toast.error("Site name and location are required");
                    return;
                  }
                  submitSiteVisit.mutate();
                }}
                className="mt-5 space-y-4"
              >
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">Site / Client name *</label>
                  <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} autoFocus placeholder="e.g. Acme Pvt Ltd" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">Location / Address *</label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Plot 12, Industrial Estate, Chennai" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink-primary">Contact person</label>
                    <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink-primary">Contact phone</label>
                    <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">Purpose of visit</label>
                  <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Product demo, follow-up, installation" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">Notes</label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">
                    Starting KM (odometer reading) — optional
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    value={kmStart}
                    onChange={(e) => setKmStart(e.target.value)}
                    placeholder="e.g. 24310"
                  />
                  <p className="mt-1 text-xs text-ink-muted">
                    Enter this now to start your trip right away, or leave it blank and start the trip later from
                    the Sales Tracker page. Once you end the trip there, KM travelled is calculated automatically.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="submit" disabled={submitSiteVisit.isPending}>
                    {submitSiteVisit.isPending ? "Saving..." : "Save & notify manager"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
