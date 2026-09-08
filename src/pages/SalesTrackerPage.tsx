import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Building2, MapPin, Palmtree, Plus, Play, Square, Navigation,
  Phone, User as UserIcon, Clock, Route as RouteIcon, Trash2, Pencil, CalendarClock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AnimatedPage, { staggerContainer, staggerItem } from "@/components/AnimatedPage";
import StatCard from "@/components/StatCard";
import UserAvatar from "@/components/UserAvatar";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import RequestSiteVisitModal from "@/components/RequestSiteVisitModal";
import SiteVisitApprovals from "@/components/SiteVisitApprovals";

const today = () => format(new Date(), "yyyy-MM-dd");

const STATUS_META: Record<string, { label: string; icon: typeof Building2; dot: string; bg: string; text: string }> = {
  office: { label: "In Office", icon: Building2, dot: "bg-primary", bg: "bg-accent-light", text: "text-primary" },
  site: { label: "On Site", icon: MapPin, dot: "bg-warning", bg: "bg-warning-light", text: "text-warning" },
  leave: { label: "On Leave", icon: Palmtree, dot: "bg-ink-muted", bg: "bg-muted", text: "text-ink-secondary" },
};

const TRIP_META: Record<string, { label: string; bg: string; text: string }> = {
  not_started: { label: "Not started", bg: "bg-muted", text: "text-ink-secondary" },
  in_progress: { label: "Visit in progress", bg: "bg-warning-light", text: "text-warning" },
  completed: { label: "Visit completed", bg: "bg-success-light", text: "text-success" },
};

const REQUEST_META: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: "Awaiting approval", bg: "bg-warning-light", text: "text-warning" },
  approved: { label: "Approved", bg: "bg-success-light", text: "text-success" },
  rejected: { label: "Rejected", bg: "bg-destructive/10", text: "text-destructive" },
};

type Profile = {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  manager_id: string | null;
};

type DailyStatus = { id: string; user_id: string; status_date: string; status: string; created_at: string };
type SiteVisit = {
  id: string; user_id: string; visit_date: string; site_name: string; location: string;
  contact_person: string | null; contact_phone: string | null; purpose: string | null; notes: string | null;
  trip_status: string; km_start: number | null; km_end: number | null; started_at: string | null; ended_at: string | null;
  trip_group_id: string; stop_order: number; created_at: string; request_id: string | null;
};

type SiteVisitRequest = {
  id: string; user_id: string; site_name: string; location: string;
  contact_person: string | null; contact_phone: string | null; purpose: string | null; notes: string | null;
  planned_at: string; status: "pending" | "approved" | "rejected";
  decision_note: string | null; site_visit_id: string | null; created_at: string;
};

/** Groups site_visits rows that belong to the same trip (same trip_group_id),
 * stops ordered by stop_order, groups ordered newest-first. */
function groupTrips(visits: SiteVisit[]): SiteVisit[][] {
  const byGroup = new Map<string, SiteVisit[]>();
  for (const v of visits) {
    const arr = byGroup.get(v.trip_group_id) ?? [];
    arr.push(v);
    byGroup.set(v.trip_group_id, arr);
  }
  const groups = Array.from(byGroup.values()).map((g) => [...g].sort((a, b) => a.stop_order - b.stop_order));
  groups.sort((a, b) => new Date(b[0].created_at).getTime() - new Date(a[0].created_at).getTime());
  return groups;
}

type SiteStop = {
  siteName: string;
  location: string;
  contactPerson: string;
  contactPhone: string;
  purpose: string;
  notes: string;
};

/** Start/End Trip controls that act on every stop in the trip group at once. */
function TripControls({ trip }: { trip: SiteVisit[] }) {
  const queryClient = useQueryClient();
  const [kmInput, setKmInput] = useState("");
  const [editing, setEditing] = useState<"start" | "end" | null>(null);
  const primary = trip[0];
  const tripGroupId = primary.trip_group_id;

  const startTrip = useMutation({
    mutationFn: async (km: number) => {
      const { error } = await supabase.from("site_visits").update({
        trip_status: "in_progress", km_start: km, started_at: new Date().toISOString(),
      }).eq("trip_group_id", tripGroupId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-tracker"] });
      toast.success("Visit started — your manager has been notified");
      setEditing(null); setKmInput("");
    },
    onError: () => toast.error("Couldn't start the visit"),
  });

  const endTrip = useMutation({
    mutationFn: async (km: number) => {
      const { error } = await supabase.from("site_visits").update({
        trip_status: "completed", km_end: km, ended_at: new Date().toISOString(),
      }).eq("trip_group_id", tripGroupId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-tracker"] });
      toast.success("Visit ended — your manager has been notified");
      setEditing(null); setKmInput("");
    },
    onError: () => toast.error("Couldn't end the visit"),
  });

  if (primary.trip_status === "completed") {
    const distance = primary.km_start != null && primary.km_end != null ? primary.km_end - primary.km_start : null;
    return (
      <div className="flex items-center gap-1.5 text-xs text-success">
        <RouteIcon className="h-3.5 w-3.5" />
        {distance != null ? `${distance} km travelled` : "Completed"}
      </div>
    );
  }

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const km = parseFloat(kmInput);
          if (isNaN(km) || km < 0) { toast.error("Enter a valid KM reading"); return; }
          if (editing === "start") startTrip.mutate(km); else endTrip.mutate(km);
        }}
        className="flex items-center gap-2"
      >
        <Input
          type="number"
          step="0.1"
          autoFocus
          placeholder={editing === "start" ? "Starting KM" : "Ending KM"}
          value={kmInput}
          onChange={(e) => setKmInput(e.target.value)}
          className="h-8 w-32"
        />
        <Button type="submit" size="sm" disabled={startTrip.isPending || endTrip.isPending}>Confirm</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(null); setKmInput(""); }}>Cancel</Button>
      </form>
    );
  }

  if (primary.trip_status === "not_started") {
    return (
      <Button size="sm" onClick={() => setEditing("start")} className="gap-1.5">
        <Play className="h-3.5 w-3.5" /> Start Visit
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {primary.km_start != null && <span className="text-xs text-ink-muted">Start KM: {primary.km_start}</span>}
      <Button size="sm" variant="destructive" onClick={() => setEditing("end")} className="gap-1.5">
        <Square className="h-3.5 w-3.5" /> End Visit
      </Button>
    </div>
  );
}

function SiteStopDetails({ visit }: { visit: SiteVisit }) {
  return (
    <div>
      <p className="text-sm font-medium text-ink-primary">{visit.site_name}</p>
      <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted"><MapPin className="h-3 w-3" /> {visit.location}</p>
      {(visit.contact_person || visit.contact_phone) && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
          <UserIcon className="h-3 w-3" /> {visit.contact_person}{visit.contact_person && visit.contact_phone ? " · " : ""}
          {visit.contact_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{visit.contact_phone}</span>}
        </p>
      )}
      {visit.purpose && <p className="mt-0.5 text-xs text-ink-muted">Purpose: {visit.purpose}</p>}
    </div>
  );
}

function TripCard({
  trip, ownerName, ownerAvatar, showOwner, onView, onEdit,
}: {
  trip: SiteVisit[]; ownerName?: string; ownerAvatar?: string | null; showOwner?: boolean;
  onView: () => void; onEdit?: () => void;
}) {
  const primary = trip[0];
  const meta = TRIP_META[primary.trip_status] ?? TRIP_META.not_started;
  // Details can only be edited before the visit is ended — once "End Visit"
  // is clicked (trip_status "completed") editing locks.
  const canEdit = !showOwner && primary.trip_status !== "completed";
  return (
    <div
      onClick={onView}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onView(); }}
      className="cursor-pointer rounded-lg border border-border p-4 transition hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {showOwner && <UserAvatar name={ownerName ?? "?"} avatarUrl={ownerAvatar} size="sm" />}
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-ink-primary">
                {trip.length > 1 ? `${trip.length} sites` : primary.site_name}
              </p>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", meta.bg, meta.text)}>{meta.label}</span>
            </div>
            {showOwner && ownerName && <p className="text-xs text-ink-muted">{ownerName}</p>}

            {trip.length > 1 ? (
              <div className="mt-2 space-y-3 border-l border-border pl-3">
                {trip.map((v) => <SiteStopDetails key={v.id} visit={v} />)}
              </div>
            ) : (
              <>
                <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted"><MapPin className="h-3 w-3" /> {primary.location}</p>
                {(primary.contact_person || primary.contact_phone) && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                    <UserIcon className="h-3 w-3" /> {primary.contact_person}{primary.contact_person && primary.contact_phone ? " · " : ""}
                    {primary.contact_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{primary.contact_phone}</span>}
                  </p>
                )}
                {primary.purpose && <p className="mt-0.5 text-xs text-ink-muted">Purpose: {primary.purpose}</p>}
              </>
            )}

            {(primary.started_at || primary.ended_at) && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-muted">
                <Clock className="h-3 w-3" />
                {primary.started_at && `Started ${format(new Date(primary.started_at), "h:mm a")}`}
                {primary.ended_at && ` · Ended ${format(new Date(primary.ended_at), "h:mm a")}`}
              </p>
            )}
          </div>
        </div>
        {!showOwner && (
          <div onClick={(e) => e.stopPropagation()} className="flex shrink-0 items-start gap-2">
            {canEdit && onEdit && (
              <button
                onClick={onEdit}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-muted hover:bg-muted hover:text-ink-primary"
                title="Edit visit details"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
            <TripControls trip={trip} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Lets the owner edit a trip's site details (name, location, contact,
 * purpose, notes) while it hasn't been ended yet. Locked out entirely once
 * "End Visit" is clicked — the trigger component only renders this when
 * trip_status !== "completed".
 */
function EditVisitModal({ trip, onClose }: { trip: SiteVisit[] | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [sites, setSites] = useState<SiteStop[]>([]);

  useEffect(() => {
    if (trip) {
      setSites(trip.map((v) => ({
        siteName: v.site_name,
        location: v.location,
        contactPerson: v.contact_person ?? "",
        contactPhone: v.contact_phone ?? "",
        purpose: v.purpose ?? "",
        notes: v.notes ?? "",
      })));
    }
  }, [trip]);

  const updateStop = (index: number, patch: Partial<SiteStop>) => {
    setSites((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!trip) return;
      const updates = trip.map((v, i) => {
        const s = sites[i];
        return supabase.from("site_visits").update({
          site_name: s.siteName.trim(),
          location: s.location.trim(),
          contact_person: s.contactPerson.trim() || null,
          contact_phone: s.contactPhone.trim() || null,
          purpose: s.purpose.trim() || null,
          notes: s.notes.trim() || null,
        }).eq("id", v.id);
      });
      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-tracker"] });
      toast.success("Visit details updated");
      onClose();
    },
    onError: () => toast.error("Couldn't update the visit"),
  });

  if (!trip) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-ink-primary/30" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="relative w-full md:max-w-[560px] max-h-[92vh] overflow-y-auto rounded-t-modal md:rounded-modal bg-card p-5 sm:p-6 shadow-modal"
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-heading text-xl font-bold text-ink-primary">Edit Visit</h2>
            <button onClick={onClose} className="text-ink-muted hover:text-ink-primary"><X className="h-5 w-5" /></button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const incomplete = sites.some((s) => !s.siteName.trim() || !s.location.trim());
              if (incomplete) {
                toast.error("Site name and location are required for every site");
                return;
              }
              save.mutate();
            }}
            className="space-y-5"
          >
            {sites.map((stop, index) => (
              <div key={index} className="rounded-lg border border-border p-4 space-y-3">
                {sites.length > 1 && <p className="text-sm font-semibold text-ink-primary">Site {index + 1}</p>}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">Site / Client name *</label>
                  <Input value={stop.siteName} onChange={(e) => updateStop(index, { siteName: e.target.value })} autoFocus={index === 0} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">Location / Address *</label>
                  <Input value={stop.location} onChange={(e) => updateStop(index, { location: e.target.value })} />
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
                  <Input value={stop.purpose} onChange={(e) => updateStop(index, { purpose: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">Notes</label>
                  <Textarea value={stop.notes} onChange={(e) => updateStop(index, { notes: e.target.value })} rows={2} />
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save changes"}</Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/** Full read-only detail view for a trip, opened by clicking its card. */
function TripDetailModal({ trip, ownerName, onClose }: { trip: SiteVisit[] | null; ownerName?: string; onClose: () => void }) {
  if (!trip) return null;
  const primary = trip[0];
  const meta = TRIP_META[primary.trip_status] ?? TRIP_META.not_started;
  const distance = primary.km_start != null && primary.km_end != null ? primary.km_end - primary.km_start : null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-ink-primary/30" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="relative w-full md:max-w-[560px] max-h-[92vh] overflow-y-auto rounded-t-modal md:rounded-modal bg-card p-5 sm:p-6 shadow-modal"
        >
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="font-heading text-xl font-bold text-ink-primary">
                {trip.length > 1 ? `Trip · ${trip.length} sites` : primary.site_name}
              </h2>
              {ownerName && <p className="text-sm text-ink-muted">{ownerName}</p>}
              <p className="text-xs text-ink-muted">{format(new Date(primary.visit_date), "EEEE, MMM d, yyyy")}</p>
            </div>
            <button onClick={onClose} className="text-ink-muted hover:text-ink-primary shrink-0"><X className="h-5 w-5" /></button>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span className={cn("rounded-full px-3 py-1 text-xs font-medium", meta.bg, meta.text)}>{meta.label}</span>
            {primary.km_start != null && (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-ink-secondary">Start KM: {primary.km_start}</span>
            )}
            {primary.km_end != null && (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-ink-secondary">End KM: {primary.km_end}</span>
            )}
            {distance != null && (
              <span className="flex items-center gap-1 rounded-full bg-success-light px-3 py-1 text-xs font-medium text-success">
                <RouteIcon className="h-3.5 w-3.5" /> {distance} km travelled
              </span>
            )}
            {primary.started_at && (
              <span className="flex items-center gap-1 text-xs text-ink-muted">
                <Clock className="h-3 w-3" /> Started {format(new Date(primary.started_at), "h:mm a")}
              </span>
            )}
            {primary.ended_at && (
              <span className="flex items-center gap-1 text-xs text-ink-muted">
                <Clock className="h-3 w-3" /> Ended {format(new Date(primary.ended_at), "h:mm a")}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {trip.map((visit, index) => (
              <div key={visit.id} className="rounded-lg border border-border p-4">
                {trip.length > 1 && <p className="mb-1 text-xs font-semibold text-ink-muted">Site {index + 1}</p>}
                <p className="text-sm font-medium text-ink-primary">{visit.site_name}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted"><MapPin className="h-3 w-3" /> {visit.location}</p>
                {(visit.contact_person || visit.contact_phone) && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                    <UserIcon className="h-3 w-3" /> {visit.contact_person}{visit.contact_person && visit.contact_phone ? " · " : ""}
                    {visit.contact_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{visit.contact_phone}</span>}
                  </p>
                )}
                {visit.purpose && <p className="mt-0.5 text-xs text-ink-muted">Purpose: {visit.purpose}</p>}
                {visit.notes && <p className="mt-0.5 text-xs text-ink-muted">Notes: {visit.notes}</p>}
              </div>
            ))}
          </div>

          <div className="mt-5 flex justify-end">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/**
 * The rep's own requests — pending / approved / rejected. Once a request is
 * approved AND its planned time has arrived, "Start Visit" creates the
 * site_visits row (linked back via request_id) and hands off into the usual
 * TripControls flow for ending the visit.
 */
function MyRequests({ requests }: { requests: SiteVisitRequest[] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const startFromRequest = useMutation({
    mutationFn: async (req: SiteVisitRequest) => {
      const tripGroupId = crypto.randomUUID();
      const { error } = await supabase.from("site_visits").insert({
        user_id: user!.id,
        visit_date: today(),
        trip_group_id: tripGroupId,
        stop_order: 1,
        site_name: req.site_name,
        location: req.location,
        contact_person: req.contact_person,
        contact_phone: req.contact_phone,
        purpose: req.purpose,
        notes: req.notes,
        request_id: req.id,
        trip_status: "not_started",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-tracker"] });
      toast.success("Visit added below — click \"Start Visit\" when you head out.");
    },
    onError: () => toast.error("Couldn't start this visit"),
  });

  if (requests.length === 0) return null;

  return (
    <div className="rounded-card border border-border bg-card p-5">
      <h2 className="mb-4 font-heading text-lg font-semibold text-ink-primary">My requests</h2>
      <div className="space-y-3">
        {requests.map((req) => {
          const meta = REQUEST_META[req.status];
          const isDue = new Date(req.planned_at).getTime() <= now.getTime();
          const alreadyStarted = !!req.site_visit_id;
          return (
            <div key={req.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink-primary">{req.site_name}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted"><MapPin className="h-3 w-3" /> {req.location}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
                    <CalendarClock className="h-3 w-3" /> Planned {format(new Date(req.planned_at), "d MMM, h:mm a")}
                  </p>
                  {req.status === "rejected" && req.decision_note && (
                    <p className="mt-1 text-xs text-destructive">Reason: {req.decision_note}</p>
                  )}
                </div>
                <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", meta.bg, meta.text)}>{meta.label}</span>
              </div>

              {req.status === "approved" && !alreadyStarted && (
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={!isDue || startFromRequest.isPending}
                    onClick={() => startFromRequest.mutate(req)}
                    title={!isDue ? "You can start this once the planned time arrives" : undefined}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {isDue ? "Start Visit" : `Available ${format(new Date(req.planned_at), "d MMM, h:mm a")}`}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SalesTrackerPage() {
  const { user, profile } = useAuth();
  const [requestOpen, setRequestOpen] = useState(false);
  const [viewTrip, setViewTrip] = useState<{ trip: SiteVisit[]; ownerName?: string } | null>(null);
  const [editTrip, setEditTrip] = useState<SiteVisit[] | null>(null);
  const isTeamHead = profile?.role === "admin" || profile?.role === "super_admin" || profile?.role === "manager";
  const isSalesDept = (profile?.department ?? "").trim().toLowerCase() === "sales";

  if (profile && !isTeamHead && !isSalesDept) {
    return (
      <AnimatedPage>
        <EmptyState
          icon={RouteIcon}
          title="Sales Tracker isn't enabled for you"
          description='Ask your admin to set your department to "Sales" in Users to log site visits and trips here.'
        />
      </AnimatedPage>
    );
  }

  const { data: people = [] } = useQuery({
    queryKey: ["sales-tracker-people"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email, avatar_url, role, manager_id").eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    enabled: isTeamHead,
  });

  const teamIds = useMemo(() => {
    if (!isTeamHead || !profile) return [];
    if (profile.role === "admin" || profile.role === "super_admin") {
      return people.filter((p) => p.id !== profile.id).map((p) => p.id);
    }
    return people.filter((p) => p.manager_id === profile.id).map((p) => p.id);
  }, [people, profile, isTeamHead]);

  const { data: myVisits = [] } = useQuery({
    queryKey: ["sales-tracker", "my-visits", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_visits").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(60);
      if (error) throw error;
      return (data ?? []) as SiteVisit[];
    },
    enabled: !!user,
  });

  const { data: myRequests = [] } = useQuery({
    queryKey: ["site-visit-requests", "mine", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_visit_requests")
        .select("*")
        .eq("user_id", user!.id)
        .order("planned_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SiteVisitRequest[];
    },
    enabled: !!user,
  });

  const { data: myStatusToday } = useQuery({
    queryKey: ["daily-status-today", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("daily_status").select("*").eq("user_id", user!.id).eq("status_date", today()).maybeSingle();
      if (error) throw error;
      return data as DailyStatus | null;
    },
    enabled: !!user,
  });

  const { data: teamStatusToday = [] } = useQuery({
    queryKey: ["sales-tracker", "team-status", teamIds],
    queryFn: async () => {
      if (teamIds.length === 0) return [];
      const { data, error } = await supabase.from("daily_status").select("*").in("user_id", teamIds).eq("status_date", today());
      if (error) throw error;
      return (data ?? []) as DailyStatus[];
    },
    enabled: isTeamHead && teamIds.length > 0,
  });

  const { data: teamVisits = [] } = useQuery({
    queryKey: ["sales-tracker", "team-visits", teamIds],
    queryFn: async () => {
      if (teamIds.length === 0) return [];
      const { data, error } = await supabase.from("site_visits").select("*").in("user_id", teamIds).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as SiteVisit[];
    },
    enabled: isTeamHead && teamIds.length > 0,
  });

  const myTrips = useMemo(() => groupTrips(myVisits), [myVisits]);
  const teamTrips = useMemo(() => groupTrips(teamVisits), [teamVisits]);

  const activeTrips = teamTrips.filter((t) => t[0].trip_status === "in_progress").length;
  const onSiteToday = teamStatusToday.filter((s) => s.status === "site").length;
  const onLeaveToday = teamStatusToday.filter((s) => s.status === "leave").length;
  const reportedToday = teamStatusToday.length;

  const peopleById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const team = useMemo(() => people.filter((p) => teamIds.includes(p.id)), [people, teamIds]);

  return (
    <AnimatedPage className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-xl sm:text-2xl font-bold text-ink-primary">Sales Tracker</h1>
          <p className="text-sm text-ink-muted">
            {isTeamHead ? "Live status and site visits for your team." : "Request approval and track your site visits."}
          </p>
        </div>
        <Button onClick={() => setRequestOpen(true)} className="gap-1.5 h-9 sm:h-10 self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Request Site Visit
        </Button>
      </div>

      {isTeamHead && (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
          <motion.div variants={staggerItem}><StatCard title="Checked in today" value={reportedToday} icon={UserIcon} /></motion.div>
          <motion.div variants={staggerItem}><StatCard title="On site today" value={onSiteToday} icon={MapPin} iconColor="text-warning" iconBg="bg-warning-light" /></motion.div>
          <motion.div variants={staggerItem}><StatCard title="On leave today" value={onLeaveToday} icon={Palmtree} iconColor="text-ink-secondary" iconBg="bg-muted" /></motion.div>
          <motion.div variants={staggerItem}><StatCard title="Active trips" value={activeTrips} icon={Navigation} iconColor="text-success" iconBg="bg-success-light" /></motion.div>
        </motion.div>
      )}

      {isTeamHead && <SiteVisitApprovals />}

      {isTeamHead && (
        <div className="rounded-xl sm:rounded-card border border-border bg-card p-3.5 sm:p-5">
          <h2 className="mb-3 sm:mb-4 font-heading text-sm sm:text-lg font-semibold text-ink-primary">Team status — today</h2>
          {team.length === 0 ? (
            <EmptyState icon={UserIcon} title="No team members yet" description="Assign team members to see their daily status here." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
              {team.map((member) => {
                const status = teamStatusToday.find((s) => s.user_id === member.id);
                const meta = status ? STATUS_META[status.status] : null;
                return (
                  <div key={member.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2 sm:px-3 sm:py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <UserAvatar name={member.full_name} avatarUrl={member.avatar_url} size="sm" />
                      <p className="truncate text-xs sm:text-sm font-medium text-ink-primary">{member.full_name}</p>
                    </div>
                    {meta ? (
                      <span className={cn("flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] sm:text-xs font-medium", meta.bg, meta.text)}>
                        <meta.icon className="h-3 w-3" /> {meta.label}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] sm:text-xs font-medium text-ink-muted">Not checked in</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isTeamHead && (
        <div className="rounded-card border border-border bg-card p-5">
          <h2 className="mb-4 font-heading text-lg font-semibold text-ink-primary">Team site visits</h2>
          {teamTrips.length === 0 ? (
            <EmptyState icon={MapPin} title="No site visits yet" description="Site visits your team logs will show up here." />
          ) : (
            <div className="space-y-3">
              {teamTrips.map((trip) => {
                const owner = peopleById[trip[0].user_id];
                return (
                  <TripCard
                    key={trip[0].trip_group_id}
                    trip={trip}
                    ownerName={owner?.full_name}
                    ownerAvatar={owner?.avatar_url}
                    showOwner
                    onView={() => setViewTrip({ trip, ownerName: owner?.full_name })}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      <MyRequests requests={myRequests} />

      <div className="rounded-card border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-ink-primary">My site visits</h2>
          {myStatusToday && (
            <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", STATUS_META[myStatusToday.status]?.bg, STATUS_META[myStatusToday.status]?.text)}>
              Today: {STATUS_META[myStatusToday.status]?.label}
            </span>
          )}
        </div>
        {myTrips.length === 0 ? (
          <EmptyState icon={MapPin} title="No site visits yet" description="Once your team lead approves a request, start it here to begin tracking KM." />
        ) : (
          <div className="space-y-3">
            {myTrips.map((trip) => (
              <TripCard
                key={trip[0].trip_group_id}
                trip={trip}
                onView={() => setViewTrip({ trip })}
                onEdit={() => setEditTrip(trip)}
              />
            ))}
          </div>
        )}
      </div>

      <RequestSiteVisitModal open={requestOpen} onClose={() => setRequestOpen(false)} />
      <TripDetailModal trip={viewTrip?.trip ?? null} ownerName={viewTrip?.ownerName} onClose={() => setViewTrip(null)} />
      <EditVisitModal trip={editTrip} onClose={() => setEditTrip(null)} />
    </AnimatedPage>
  );
}
