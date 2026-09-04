import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, MapPin, Palmtree, Plus, Trash2 } from "lucide-react";
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

type SiteStop = {
  siteName: string;
  location: string;
  contactPerson: string;
  contactPhone: string;
  purpose: string;
  notes: string;
};

const emptyStop = (): SiteStop => ({ siteName: "", location: "", contactPerson: "", contactPhone: "", purpose: "", notes: "" });

/**
 * Shown once per day, right after login. Every signed-in user picks one of
 * In Office / On Site / Leave; picking On Site also captures one or more
 * site stops for the trip up front. Their manager (or admins, if they have
 * none) gets a notification automatically via a DB trigger.
 */
export default function DailyStatusModal() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"pick" | "site-details">("pick");
  const [sites, setSites] = useState<SiteStop[]>([emptyStop()]);
  const [dismissed, setDismissed] = useState(false);

  // Only people the admin has put in the "Sales" department get the daily
  // check-in prompt — everyone else's login is unaffected.
  const isSalesDept = (profile?.department ?? "").trim().toLowerCase() === "sales";

  // Admin-configurable time of day the popup starts appearing (Sales Tracker
  // page). Defaults to 09:30 if nothing has been configured yet.
  const { data: settings } = useQuery({
    queryKey: ["sales-tracker-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_tracker_settings").select("checkin_time").eq("id", "default").maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isSalesDept,
    staleTime: 5 * 60 * 1000,
  });
  const checkinTime = settings?.checkin_time ?? "09:30:00";

  // Re-checked every minute so the popup appears on its own once the
  // configured time arrives, without needing a page refresh.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  const isPastCheckinTime = format(now, "HH:mm:ss") >= checkinTime;

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
      setSites([emptyStop()]);
    }
  }, [existingStatus]);

  const open = isSalesDept && isPastCheckinTime && !isLoading && !!user && !!profile && !existingStatus && !dismissed;

  const updateStop = (index: number, patch: Partial<SiteStop>) => {
    setSites((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };
  const addStop = () => setSites((prev) => [...prev, emptyStop()]);
  const removeStop = (index: number) => setSites((prev) => prev.filter((_, i) => i !== index));

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

  // Saves the visit details only. The trip itself only starts once the user
  // clicks "Start Visit" on the Sales Tracker page and enters the starting KM
  // there, and ends the same way with "End Visit".
  const submitSiteVisit = useMutation({
    mutationFn: async () => {
      const dailyStatusId = submitStatus.data?.id ?? existingStatus?.id;
      const tripGroupId = crypto.randomUUID();
      const rows = sites.map((s, i) => ({
        user_id: user!.id,
        daily_status_id: dailyStatusId,
        visit_date: today(),
        trip_group_id: tripGroupId,
        stop_order: i + 1,
        site_name: s.siteName.trim(),
        location: s.location.trim(),
        contact_person: s.contactPerson.trim() || null,
        contact_phone: s.contactPhone.trim() || null,
        purpose: s.purpose.trim() || null,
        notes: s.notes.trim() || null,
      }));
      const { error } = await supabase.from("site_visits").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-tracker"] });
      queryClient.invalidateQueries({ queryKey: ["my-site-visits"] });
      toast.success("Site visit saved — your manager has been notified. Click \"Start Visit\" on the Sales Tracker page when you head out.");
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
          className="relative w-full max-w-[560px] max-h-[90vh] overflow-y-auto rounded-modal bg-card p-6 shadow-modal mx-4"
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
                Tell us where you're headed today — add more than one site if this trip covers several stops.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const incomplete = sites.some((s) => !s.siteName.trim() || !s.location.trim());
                  if (incomplete) {
                    toast.error("Site name and location are required for every site");
                    return;
                  }
                  submitSiteVisit.mutate();
                }}
                className="mt-5 space-y-5"
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
                      <Input
                        value={stop.location}
                        onChange={(e) => updateStop(index, { location: e.target.value })}
                        placeholder="e.g. Plot 12, Industrial Estate, Chennai"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-ink-primary">Contact person</label>
                        <Input value={stop.contactPerson} onChange={(e) => updateStop(index, { contactPerson: e.target.value })} />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-ink-primary">Contact phone</label>
                        <Input value={stop.contactPhone} onChange={(e) => updateStop(index, { contactPhone: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink-primary">Purpose of visit</label>
                      <Input
                        value={stop.purpose}
                        onChange={(e) => updateStop(index, { purpose: e.target.value })}
                        placeholder="e.g. Product demo, follow-up, installation"
                      />
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

                <p className="text-xs text-ink-muted">
                  Save the details now — you'll enter the starting KM and click "Start Visit" on the Sales Tracker
                  page once you actually head out, and "End Visit" with the ending KM once you're back.
                </p>

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
