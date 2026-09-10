import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Building2, MapPin, Palmtree, User as UserIcon, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AnimatedPage, { staggerContainer, staggerItem } from "@/components/AnimatedPage";
import StatCard from "@/components/StatCard";
import UserAvatar from "@/components/UserAvatar";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
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

/** Lets the signed-in user mark their own status (office/site/leave) for
 * today — a plain row insert/update into daily_status. No GPS, no site
 * details, no KM — just the marker. */
function MarkStatusModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const markStatus = useMutation({
    mutationFn: async (status: "office" | "site" | "leave") => {
      const { data: existing, error: fetchError } = await supabase
        .from("daily_status")
        .select("id")
        .eq("user_id", user!.id)
        .eq("status_date", today())
        .maybeSingle();
      if (fetchError) throw fetchError;

      if (existing) {
        const { error } = await supabase.from("daily_status").update({ status }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("daily_status").insert({ user_id: user!.id, status_date: today(), status });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-status-today"] });
      queryClient.invalidateQueries({ queryKey: ["sales-tracker", "team-status"] });
      toast.success("Status updated");
      onClose();
    },
    onError: () => toast.error("Couldn't update your status"),
  });

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-ink-primary/30" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative w-full md:max-w-[420px] rounded-t-modal md:rounded-modal bg-card p-5 sm:p-6 shadow-modal"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-xl font-bold text-ink-primary">Mark today's status</h2>
              <button onClick={onClose} className="text-ink-muted hover:text-ink-primary"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => markStatus.mutate(opt.value)}
                  disabled={markStatus.isPending}
                  className="flex w-full items-center gap-3 rounded-lg border border-border p-3.5 text-left transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
                >
                  <opt.icon className="h-5 w-5 text-ink-secondary" />
                  <span className="font-medium text-ink-primary">{opt.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default function SalesTrackerPage() {
  const { user, profile } = useAuth();
  const [markOpen, setMarkOpen] = useState(false);
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
            {isTeamHead ? "Live daily status for your team." : "Mark your daily status."}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {myStatusToday && (
            <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", STATUS_META[myStatusToday.status]?.bg, STATUS_META[myStatusToday.status]?.text)}>
              Today: {STATUS_META[myStatusToday.status]?.label}
            </span>
          )}
          <Button onClick={() => setMarkOpen(true)} className="gap-1.5 h-9 sm:h-10">
            Mark my status
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

      <MarkStatusModal open={markOpen} onClose={() => setMarkOpen(false)} />
    </AnimatedPage>
  );
}
