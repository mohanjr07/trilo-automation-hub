import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isToday } from "date-fns";
import {
  Building2, MapPin, Palmtree, Plus, Play, Square, Navigation,
  Phone, User as UserIcon, Clock, Route as RouteIcon, AlarmClock,
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

const today = () => format(new Date(), "yyyy-MM-dd");

const STATUS_META: Record<string, { label: string; icon: typeof Building2; dot: string; bg: string; text: string }> = {
  office: { label: "In Office", icon: Building2, dot: "bg-primary", bg: "bg-accent-light", text: "text-primary" },
  site: { label: "On Site", icon: MapPin, dot: "bg-warning", bg: "bg-warning-light", text: "text-warning" },
  leave: { label: "On Leave", icon: Palmtree, dot: "bg-ink-muted", bg: "bg-muted", text: "text-ink-secondary" },
};

const TRIP_META: Record<string, { label: string; bg: string; text: string }> = {
  not_started: { label: "Not started", bg: "bg-muted", text: "text-ink-secondary" },
  in_progress: { label: "Trip in progress", bg: "bg-warning-light", text: "text-warning" },
  completed: { label: "Trip completed", bg: "bg-success-light", text: "text-success" },
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
};

function NewVisitModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [siteName, setSiteName] = useState("");
  const [location, setLocation] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [kmStart, setKmStart] = useState("");

  const reset = () => {
    setSiteName(""); setLocation(""); setContactPerson(""); setContactPhone(""); setPurpose(""); setNotes(""); setKmStart("");
  };

  const create = useMutation({
    mutationFn: async () => {
      const km = kmStart.trim() ? parseFloat(kmStart) : null;
      const startingTrip = km != null && !isNaN(km);
      const { error } = await supabase.from("site_visits").insert({
        user_id: user!.id,
        visit_date: today(),
        site_name: siteName.trim(),
        location: location.trim(),
        contact_person: contactPerson.trim() || null,
        contact_phone: contactPhone.trim() || null,
        purpose: purpose.trim() || null,
        notes: notes.trim() || null,
        ...(startingTrip
          ? { trip_status: "in_progress", km_start: km, started_at: new Date().toISOString() }
          : {}),
      });
      if (error) throw error;
      return { startingTrip };
    },
    onSuccess: ({ startingTrip }) => {
      queryClient.invalidateQueries({ queryKey: ["sales-tracker"] });
      toast.success(startingTrip ? "Trip started — your manager has been notified" : "Site visit logged — your manager has been notified");
      reset();
      onClose();
    },
    onError: () => toast.error("Couldn't save the site visit"),
  });

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-ink-primary/30" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative w-full max-w-[520px] max-h-[90vh] overflow-y-auto rounded-modal bg-card p-6 shadow-modal mx-4"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-xl font-bold text-ink-primary">New Site Visit</h2>
              <button onClick={onClose} className="text-ink-muted hover:text-ink-primary"><X className="h-5 w-5" /></button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!siteName.trim() || !location.trim()) {
                  toast.error("Site name and location are required");
                  return;
                }
                create.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-primary">Site / Client name *</label>
                <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-primary">Location / Address *</label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} />
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
                <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-primary">Notes</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-primary">
                  Starting KM (odometer reading) — optional
                </label>
                <Input type="number" step="0.1" inputMode="decimal" value={kmStart} onChange={(e) => setKmStart(e.target.value)} placeholder="e.g. 24310" />
                <p className="mt-1 text-xs text-ink-muted">
                  Enter this to start the trip right away — or leave blank and hit "Start Trip" on the visit later. KM
                  travelled is calculated automatically when you end the trip.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={create.isPending}>{create.isPending ? "Saving..." : "Save visit"}</Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function TripControls({ visit }: { visit: SiteVisit }) {
  const queryClient = useQueryClient();
  const [kmInput, setKmInput] = useState("");
  const [editing, setEditing] = useState<"start" | "end" | null>(null);

  const startTrip = useMutation({
    mutationFn: async (km: number) => {
      const { error } = await supabase.from("site_visits").update({
        trip_status: "in_progress", km_start: km, started_at: new Date().toISOString(),
      }).eq("id", visit.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-tracker"] });
      toast.success("Trip started — your manager has been notified");
      setEditing(null); setKmInput("");
    },
    onError: () => toast.error("Couldn't start the trip"),
  });

  const endTrip = useMutation({
    mutationFn: async (km: number) => {
      const { error } = await supabase.from("site_visits").update({
        trip_status: "completed", km_end: km, ended_at: new Date().toISOString(),
      }).eq("id", visit.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-tracker"] });
      toast.success("Trip ended — your manager has been notified");
      setEditing(null); setKmInput("");
    },
    onError: () => toast.error("Couldn't end the trip"),
  });

  if (visit.trip_status === "completed") {
    const distance = visit.km_start != null && visit.km_end != null ? visit.km_end - visit.km_start : null;
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

  if (visit.trip_status === "not_started") {
    return (
      <Button size="sm" onClick={() => setEditing("start")} className="gap-1.5">
        <Play className="h-3.5 w-3.5" /> Start Trip
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {visit.km_start != null && <span className="text-xs text-ink-muted">Start KM: {visit.km_start}</span>}
      <Button size="sm" variant="destructive" onClick={() => setEditing("end")} className="gap-1.5">
        <Square className="h-3.5 w-3.5" /> End Trip
      </Button>
    </div>
  );
}

function VisitCard({ visit, ownerName, ownerAvatar, showOwner }: { visit: SiteVisit; ownerName?: string; ownerAvatar?: string | null; showOwner?: boolean }) {
  const meta = TRIP_META[visit.trip_status] ?? TRIP_META.not_started;
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {showOwner && <UserAvatar name={ownerName ?? "?"} avatarUrl={ownerAvatar} size="sm" />}
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-ink-primary">{visit.site_name}</p>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", meta.bg, meta.text)}>{meta.label}</span>
            </div>
            {showOwner && ownerName && <p className="text-xs text-ink-muted">{ownerName}</p>}
            <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted"><MapPin className="h-3 w-3" /> {visit.location}</p>
            {(visit.contact_person || visit.contact_phone) && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                <UserIcon className="h-3 w-3" /> {visit.contact_person}{visit.contact_person && visit.contact_phone ? " · " : ""}
                {visit.contact_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{visit.contact_phone}</span>}
              </p>
            )}
            {visit.purpose && <p className="mt-0.5 text-xs text-ink-muted">Purpose: {visit.purpose}</p>}
            {(visit.started_at || visit.ended_at) && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                <Clock className="h-3 w-3" />
                {visit.started_at && `Started ${format(new Date(visit.started_at), "h:mm a")}`}
                {visit.ended_at && ` · Ended ${format(new Date(visit.ended_at), "h:mm a")}`}
              </p>
            )}
          </div>
        </div>
        {!showOwner && <TripControls visit={visit} />}
      </div>
    </div>
  );
}

function CheckinTimeSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["sales-tracker-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_tracker_settings").select("*").eq("id", "default").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // checkin_time comes back as "HH:MM:SS" — <input type="time"> wants "HH:MM".
  const [time, setTime] = useState("09:30");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (settings?.checkin_time && !touched) setTime(settings.checkin_time.slice(0, 5));
  }, [settings?.checkin_time, touched]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("sales_tracker_settings")
        .update({ checkin_time: `${time}:00`, updated_by: user!.id, updated_at: new Date().toISOString() })
        .eq("id", "default");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-tracker-settings"] });
      setTouched(false);
      toast.success("Check-in time updated");
    },
    onError: () => toast.error("Couldn't save the check-in time"),
  });

  return (
    <div className="rounded-card border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <AlarmClock className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading text-lg font-semibold text-ink-primary">Daily check-in popup time</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Choose what time the In Office / On Site / Leave popup starts appearing for Sales-department staff.
            It stays hidden before this time and shows up automatically once it arrives — no page refresh needed.
          </p>
          <div className="mt-4 flex items-end gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-primary">Check-in time</label>
              <Input
                type="time"
                value={time}
                onChange={(e) => { setTime(e.target.value); setTouched(true); }}
                className="w-40 h-10"
              />
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !time}>
              {save.isPending ? "Saving..." : "Save"}
            </Button>
            {settings?.checkin_time && !touched && (
              <span className="pb-2.5 text-xs text-ink-muted">Currently {settings.checkin_time.slice(0, 5)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SalesTrackerPage() {
  const { user, profile } = useAuth();
  const [newVisitOpen, setNewVisitOpen] = useState(false);
  const isTeamHead = profile?.role === "admin" || profile?.role === "super_admin" || profile?.role === "manager";
  const isSalesDept = (profile?.department ?? "").trim().toLowerCase() === "sales";
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

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
      const { data, error } = await supabase.from("site_visits").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return (data ?? []) as SiteVisit[];
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
      const { data, error } = await supabase.from("site_visits").select("*").in("user_id", teamIds).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as SiteVisit[];
    },
    enabled: isTeamHead && teamIds.length > 0,
  });

  const activeTrips = teamVisits.filter((v) => v.trip_status === "in_progress").length;
  const onSiteToday = teamStatusToday.filter((s) => s.status === "site").length;
  const onLeaveToday = teamStatusToday.filter((s) => s.status === "leave").length;
  const reportedToday = teamStatusToday.length;

  const peopleById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const team = useMemo(() => people.filter((p) => teamIds.includes(p.id)), [people, teamIds]);

  return (
    <AnimatedPage className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink-primary">Sales Tracker</h1>
          <p className="text-sm text-ink-muted">
            {isTeamHead ? "Live status and site visits for your team." : "Log your site visits and track your trips."}
          </p>
        </div>
        <Button onClick={() => setNewVisitOpen(true)} className="gap-1.5 self-start sm:self-auto">
          <Plus className="h-4 w-4" /> New Site Visit
        </Button>
      </div>

      {isAdmin && <CheckinTimeSettings />}

      {isTeamHead && (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <motion.div variants={staggerItem}><StatCard title="Checked in today" value={reportedToday} icon={UserIcon} /></motion.div>
          <motion.div variants={staggerItem}><StatCard title="On site today" value={onSiteToday} icon={MapPin} iconColor="text-warning" iconBg="bg-warning-light" /></motion.div>
          <motion.div variants={staggerItem}><StatCard title="On leave today" value={onLeaveToday} icon={Palmtree} iconColor="text-ink-secondary" iconBg="bg-muted" /></motion.div>
          <motion.div variants={staggerItem}><StatCard title="Active trips" value={activeTrips} icon={Navigation} iconColor="text-success" iconBg="bg-success-light" /></motion.div>
        </motion.div>
      )}

      {isTeamHead && (
        <div className="rounded-card border border-border bg-card p-5">
          <h2 className="mb-4 font-heading text-lg font-semibold text-ink-primary">Team status — today</h2>
          {team.length === 0 ? (
            <EmptyState icon={UserIcon} title="No team members yet" description="Assign team members to see their daily status here." />
          ) : (
            <div className="space-y-2">
              {team.map((member) => {
                const status = teamStatusToday.find((s) => s.user_id === member.id);
                const meta = status ? STATUS_META[status.status] : null;
                return (
                  <div key={member.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={member.full_name} avatarUrl={member.avatar_url} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-ink-primary">{member.full_name}</p>
                        <p className="text-xs text-ink-muted">{member.email}</p>
                      </div>
                    </div>
                    {meta ? (
                      <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", meta.bg, meta.text)}>
                        <meta.icon className="h-3.5 w-3.5" /> {meta.label}
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-ink-muted">Not checked in</span>
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
          {teamVisits.length === 0 ? (
            <EmptyState icon={MapPin} title="No site visits yet" description="Site visits your team logs will show up here." />
          ) : (
            <div className="space-y-3">
              {teamVisits.map((v) => {
                const owner = peopleById[v.user_id];
                return <VisitCard key={v.id} visit={v} ownerName={owner?.full_name} ownerAvatar={owner?.avatar_url} showOwner />;
              })}
            </div>
          )}
        </div>
      )}

      <div className="rounded-card border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-ink-primary">My site visits</h2>
          {myStatusToday && (
            <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", STATUS_META[myStatusToday.status]?.bg, STATUS_META[myStatusToday.status]?.text)}>
              Today: {STATUS_META[myStatusToday.status]?.label}
            </span>
          )}
        </div>
        {myVisits.length === 0 ? (
          <EmptyState icon={MapPin} title="No site visits yet" description="Log a site visit to start tracking your trips and KM travelled." />
        ) : (
          <div className="space-y-3">
            {myVisits.map((v) => <VisitCard key={v.id} visit={v} />)}
          </div>
        )}
      </div>

      <NewVisitModal open={newVisitOpen} onClose={() => setNewVisitOpen(false)} />
    </AnimatedPage>
  );
}
