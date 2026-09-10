import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Building2, MapPin, Palmtree, User as UserIcon, Plus, Play, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AnimatedPage, { staggerContainer, staggerItem } from "@/components/AnimatedPage";
import StatCard from "@/components/StatCard";
import UserAvatar from "@/components/UserAvatar";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import RequestSiteVisitModal from "@/components/RequestSiteVisitModal";
import SiteVisitApprovals from "@/components/SiteVisitApprovals";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const today = () => format(new Date(), "yyyy-MM-dd");

const STATUS_META: Record<string, { label: string; icon: typeof Building2; dot: string; bg: string; text: string }> = {
  office: { label: "In Office", icon: Building2, dot: "bg-primary", bg: "bg-accent-light", text: "text-primary" },
  site: { label: "On Site", icon: MapPin, dot: "bg-warning", bg: "bg-warning-light", text: "text-warning" },
  leave: { label: "On Leave", icon: Palmtree, dot: "bg-ink-muted", bg: "bg-muted", text: "text-ink-secondary" },
};

const STATUS_OPTIONS: Array<{ value: "office" | "site" | "leave"; label: string; icon: typeof Building2 }> = [
  { value: "office", label: "In Office", icon: Building2 },
  { value: "site", label: "On Site", icon: MapPin },
  { value: "leave", label: "On Leave", icon: Palmtree },
];

type Profile = {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  manager_id: string | null;
};

type DailyStatus = { id: string; user_id: string; status_date: string; status: string; created_at: string };

type MyRequestStop = {
  id: string;
  trip_group_id: string;
  stop_order: number;
  site_name: string;
  location: string;
  purpose: string | null;
  planned_at: string;
  status: "pending" | "approved" | "rejected";
  decision_note: string | null;
  visit_status: "not_started" | "in_progress" | "completed";
  visit_started_at: string | null;
  visit_ended_at: string | null;
};

const REQUEST_STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: "Pending approval", bg: "bg-warning-light", text: "text-warning" },
  approved: { label: "Approved", bg: "bg-success/10", text: "text-success" },
  rejected: { label: "Rejected", bg: "bg-destructive/10", text: "text-destructive" },
};

const VISIT_STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  in_progress: { label: "Visit in progress", bg: "bg-primary/10", text: "text-primary" },
  completed: { label: "Visit completed", bg: "bg-success/10", text: "text-success" },
};

/** The signed-in user's own recent site-visit requests, grouped by trip. */
function MySiteVisits() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: rows = [] } = useQuery({
    queryKey: ["site-visit-requests", "mine", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_visit_requests")
        .select(
          "id, trip_group_id, stop_order, site_name, location, purpose, planned_at, status, decision_note, visit_status, visit_started_at, visit_ended_at"
        )
        .eq("user_id", user!.id)
        .order("planned_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as MyRequestStop[];
    },
    enabled: !!user,
  });

  const groups = useMemo(() => {
    const byGroup = new Map<string, MyRequestStop[]>();
    for (const r of rows) {
      const arr = byGroup.get(r.trip_group_id) ?? [];
      arr.push(r);
      byGroup.set(r.trip_group_id, arr);
    }
    return Array.from(byGroup.values())
      .map((g) => [...g].sort((a, b) => a.stop_order - b.stop_order))
      .sort((a, b) => new Date(b[0].planned_at).getTime() - new Date(a[0].planned_at).getTime());
  }, [rows]);

  const setVisitStatus = useMutation({
    mutationFn: async ({ tripGroupId, visitStatus }: { tripGroupId: string; visitStatus: "in_progress" | "completed" }) => {
      const { error } = await supabase
        .from("site_visit_requests")
        .update({ visit_status: visitStatus })
        .eq("trip_group_id", tripGroupId);
      if (error) throw error;
    },
    onSuccess: (_data, { visitStatus }) => {
      queryClient.invalidateQueries({ queryKey: ["site-visit-requests"] });
      toast.success(visitStatus === "in_progress" ? "Visit started" : "Visit ended");
    },
    onError: () => toast.error("Couldn't update the visit — it may not be approved yet"),
  });

  if (groups.length === 0) {
    return <EmptyState icon={MapPin} title="No site visits yet" description="Request a site visit to see it here." />;
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const primary = group[0];
        const meta = REQUEST_STATUS_META[primary.status];
        const visitMeta = VISIT_STATUS_META[primary.visit_status];
        const plannedIsFuture = new Date(primary.planned_at) > new Date() && format(new Date(primary.planned_at), "yyyy-MM-dd") !== today();
        const canStart =
          primary.visit_status === "not_started" &&
          primary.status !== "rejected" &&
          !(primary.status === "pending" && plannedIsFuture);
        const canEnd = primary.visit_status === "in_progress";

        return (
          <div key={primary.trip_group_id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink-primary">
                  {group.length > 1 ? `${group.length} sites` : primary.site_name}
                </p>
                <p className="text-xs text-ink-muted">
                  {format(new Date(primary.planned_at), "d MMM yyyy, h:mm a")}
                  {primary.purpose ? ` · ${primary.purpose}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", meta.bg, meta.text)}>
                  {meta.label}
                </span>
                {visitMeta && (
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", visitMeta.bg, visitMeta.text)}>
                    {visitMeta.label}
                  </span>
                )}
              </div>
            </div>
            {primary.status === "rejected" && primary.decision_note && (
              <p className="mt-1.5 text-xs text-ink-muted">Reason: {primary.decision_note}</p>
            )}
            {primary.visit_started_at && (
              <p className="mt-1.5 text-xs text-ink-muted">
                Started {format(new Date(primary.visit_started_at), "d MMM, h:mm a")}
                {primary.visit_ended_at ? ` · Ended ${format(new Date(primary.visit_ended_at), "d MMM, h:mm a")}` : ""}
              </p>
            )}
            {(canStart || canEnd) && (
              <div className="mt-2.5">
                {canStart && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={setVisitStatus.isPending}
                    onClick={() => setVisitStatus.mutate({ tripGroupId: primary.trip_group_id, visitStatus: "in_progress" })}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Start Visit
                  </Button>
                )}
                {canEnd && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={setVisitStatus.isPending}
                    onClick={() => setVisitStatus.mutate({ tripGroupId: primary.trip_group_id, visitStatus: "completed" })}
                  >
                    <Square className="h-3.5 w-3.5" />
                    End Visit
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SalesTrackerPage() {
  const { user, profile } = useAuth();
  const [requestOpen, setRequestOpen] = useState(false);
  const isTeamHead = profile?.role === "admin" || profile?.role === "super_admin" || profile?.role === "manager";
  const isSalesDept = (profile?.department ?? "").trim().toLowerCase() === "sales";

  if (profile && !isTeamHead && !isSalesDept) {
    return (
      <AnimatedPage>
        <EmptyState
          icon={UserIcon}
          title="Sales Tracker isn't enabled for you"
          description='Ask your admin to set your department to "Sales" in Users to mark your daily status here.'
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

  const onSiteToday = teamStatusToday.filter((s) => s.status === "site").length;
  const onLeaveToday = teamStatusToday.filter((s) => s.status === "leave").length;
  const reportedToday = teamStatusToday.length;

  const team = useMemo(() => people.filter((p) => teamIds.includes(p.id)), [people, teamIds]);

  return (
    <AnimatedPage className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-xl sm:text-2xl font-bold text-ink-primary">Sales Tracker</h1>
          <p className="text-sm text-ink-muted">
            {isTeamHead ? "Live daily status for your team." : "Mark your daily status and request site visits."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {myStatusToday && (
            <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", STATUS_META[myStatusToday.status]?.bg, STATUS_META[myStatusToday.status]?.text)}>
              Today: {STATUS_META[myStatusToday.status]?.label}
            </span>
          )}
          <Button variant="outline" onClick={() => setRequestOpen(true)} className="gap-1.5 h-9 sm:h-10">
            <Plus className="h-4 w-4" />
            Request Site Visit
          </Button>
        </div>
      </div>

      {isTeamHead && (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3">
          <motion.div variants={staggerItem}><StatCard title="Checked in today" value={reportedToday} icon={UserIcon} /></motion.div>
          <motion.div variants={staggerItem}><StatCard title="On site today" value={onSiteToday} icon={MapPin} iconColor="text-warning" iconBg="bg-warning-light" /></motion.div>
          <motion.div variants={staggerItem}><StatCard title="On leave today" value={onLeaveToday} icon={Palmtree} iconColor="text-ink-secondary" iconBg="bg-muted" /></motion.div>
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

      <div className="rounded-xl sm:rounded-card border border-border bg-card p-3.5 sm:p-5">
        <h2 className="mb-3 sm:mb-4 font-heading text-sm sm:text-lg font-semibold text-ink-primary">My site visits</h2>
        <MySiteVisits />
      </div>

      <RequestSiteVisitModal open={requestOpen} onClose={() => setRequestOpen(false)} />
    </AnimatedPage>
  );
}
