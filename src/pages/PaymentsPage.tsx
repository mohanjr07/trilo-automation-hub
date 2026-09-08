import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, Plus, X, FileText, Download, CheckCircle2, XCircle,
  Clock, Banknote, Upload, Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AnimatedPage, { staggerContainer, staggerItem } from "@/components/AnimatedPage";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BUCKET = "payment-receipts";

type Project = { id: string; name: string };

type PaymentRequest = {
  id: string;
  requester_id: string;
  requester_name: string | null;
  project_id: string | null;
  project_name: string | null;
  purpose: string;
  amount: number;
  bill_file_path: string;
  bill_file_name: string | null;
  bill_mime_type: string | null;
  status: "pending" | "approved" | "rejected" | "paid";
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  paid_by: string | null;
  paid_by_name: string | null;
  paid_at: string | null;
  created_at: string;
};

const STATUS_META: Record<PaymentRequest["status"], { label: string; bg: string; text: string; icon: typeof Clock }> = {
  pending: { label: "Pending", bg: "bg-warning-light", text: "text-warning", icon: Clock },
  approved: { label: "Approved", bg: "bg-accent-light", text: "text-primary", icon: CheckCircle2 },
  rejected: { label: "Rejected", bg: "bg-destructive/10", text: "text-destructive", icon: XCircle },
  paid: { label: "Paid", bg: "bg-success-light", text: "text-success", icon: Banknote },
};

const formatAmount = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function StatusBadge({ status }: { status: PaymentRequest["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn("flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", meta.bg, meta.text)}>
      <meta.icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

/** Request Payment — open to any signed-in user. */
function RequestPaymentModal({ open, onClose, projects }: { open: boolean; onClose: () => void; projects: Project[] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState<string>("");
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setProjectId("");
    setPurpose("");
    setAmount("");
    setFile(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (!purpose.trim()) { toast.error("Enter a purpose / description"); return; }
    if (!amountNum || amountNum <= 0) { toast.error("Enter a valid amount"); return; }
    if (!file) { toast.error("Attach the bill / receipt"); return; }

    setSubmitting(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user!.id}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("payment_requests").insert({
        requester_id: user!.id,
        project_id: projectId || null,
        purpose: purpose.trim(),
        amount: amountNum,
        bill_file_path: path,
        bill_file_name: file.name,
        bill_mime_type: file.type || null,
      });
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
        throw insErr;
      }

      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      toast.success("Payment request submitted");
      reset();
      onClose();
    } catch (err: any) {
      toast.error("Couldn't submit request: " + (err?.message ?? ""));
    } finally {
      setSubmitting(false);
    }
  };

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
            className="relative w-full md:max-w-[520px] max-h-[92vh] overflow-y-auto rounded-t-modal md:rounded-modal bg-card p-5 sm:p-6 shadow-modal"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-xl font-bold text-ink-primary">Request Payment</h2>
              <button onClick={onClose} className="text-ink-muted hover:text-ink-primary"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {projects.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">Project</label>
                  <Select value={projectId || undefined} onValueChange={setProjectId}>
                    <SelectTrigger><SelectValue placeholder="Select a project (optional)" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-primary">Purpose / Description *</label>
                <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} placeholder="What is this payment for?" autoFocus />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-primary">Amount *</label>
                <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-primary">Bill / Receipt *</label>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border p-5 text-center hover:border-primary/50 hover:bg-primary/5">
                  <Upload className="h-5 w-5 text-ink-muted" />
                  <span className="text-sm text-ink-muted">{file ? file.name : "Click to choose an image or PDF"}</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={submitting} className="gap-1.5">
                  <Plus className="h-4 w-4" /> {submitting ? "Submitting..." : "Submit request"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Full detail view — approve/reject (admin) or mark paid (accountant). */
function PaymentDetailModal({
  request, onClose, isAdmin, isAccountant,
}: {
  request: PaymentRequest | null; onClose: () => void; isAdmin: boolean; isAccountant: boolean;
}) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const { user } = useAuth();

  const decide = useMutation({
    mutationFn: async ({ status, decisionNote }: { status: "approved" | "rejected"; decisionNote?: string }) => {
      if (!request) return;
      const { error } = await supabase.from("payment_requests").update({
        status,
        decided_by: user!.id,
        decided_at: new Date().toISOString(),
        decision_note: decisionNote?.trim() || null,
      }).eq("id", request.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      toast.success(vars.status === "approved" ? "Request approved" : "Request rejected");
      setRejecting(false);
      setReason("");
      onClose();
    },
    onError: () => toast.error("Couldn't save your decision"),
  });

  const markPaid = useMutation({
    mutationFn: async () => {
      if (!request) return;
      const { error } = await supabase.from("payment_requests").update({
        status: "paid",
        paid_by: user!.id,
        paid_at: new Date().toISOString(),
      }).eq("id", request.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      toast.success("Marked as paid");
      onClose();
    },
    onError: () => toast.error("Couldn't mark this as paid"),
  });

  const viewBill = async () => {
    if (!request) return;
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(request.bill_file_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error("Couldn't open the bill: " + (err?.message ?? ""));
    }
  };

  const downloadBill = async () => {
    if (!request) return;
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(request.bill_file_path, 60);
      if (error) throw error;
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.download = request.bill_file_name ?? "bill";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      toast.error("Download failed: " + (err?.message ?? ""));
    }
  };

  if (!request) return null;

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
              <h2 className="font-heading text-xl font-bold text-ink-primary">₹{formatAmount(request.amount)}</h2>
              <p className="text-sm text-ink-muted">{request.requester_name ?? "A team member"}</p>
              <p className="text-xs text-ink-muted">{format(new Date(request.created_at), "EEEE, MMM d, yyyy · h:mm a")}</p>
            </div>
            <button onClick={onClose} className="text-ink-muted hover:text-ink-primary shrink-0"><X className="h-5 w-5" /></button>
          </div>

          <div className="mb-5"><StatusBadge status={request.status} /></div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            {request.project_name && (
              <div><p className="text-xs font-medium text-ink-muted">Project</p><p className="text-sm text-ink-primary">{request.project_name}</p></div>
            )}
            <div><p className="text-xs font-medium text-ink-muted">Purpose</p><p className="text-sm text-ink-primary">{request.purpose}</p></div>
            <div>
              <p className="text-xs font-medium text-ink-muted">Bill / Receipt</p>
              <div className="mt-1 flex items-center gap-3">
                <button onClick={viewBill} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                  <FileText className="h-4 w-4" /> {request.bill_file_name ?? "View file"}
                </button>
                <button onClick={downloadBill} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary">
                  <Download className="h-4 w-4" /> Download
                </button>
              </div>
            </div>
            {request.decided_by_name && (
              <div>
                <p className="text-xs font-medium text-ink-muted">{request.status === "rejected" ? "Rejected by" : "Approved by"}</p>
                <p className="text-sm text-ink-primary">
                  {request.decided_by_name}{request.decided_at && ` · ${format(new Date(request.decided_at), "MMM d, h:mm a")}`}
                </p>
                {request.decision_note && <p className="mt-0.5 text-xs text-ink-muted">"{request.decision_note}"</p>}
              </div>
            )}
            {request.paid_by_name && (
              <div>
                <p className="text-xs font-medium text-ink-muted">Paid by</p>
                <p className="text-sm text-ink-primary">
                  {request.paid_by_name}{request.paid_at && ` · ${format(new Date(request.paid_at), "MMM d, h:mm a")}`}
                </p>
              </div>
            )}
          </div>

          {isAdmin && request.status === "pending" && (
            rejecting ? (
              <div className="mt-4 space-y-2">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejecting (optional)" rows={2} autoFocus />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => { setRejecting(false); setReason(""); }}>Cancel</Button>
                  <Button type="button" variant="destructive" disabled={decide.isPending} onClick={() => decide.mutate({ status: "rejected", decisionNote: reason })}>
                    Confirm reject
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" className="gap-1.5" disabled={decide.isPending} onClick={() => setRejecting(true)}>
                  <XCircle className="h-4 w-4" /> Reject
                </Button>
                <Button type="button" className="gap-1.5" disabled={decide.isPending} onClick={() => decide.mutate({ status: "approved" })}>
                  <CheckCircle2 className="h-4 w-4" /> Approve
                </Button>
              </div>
            )
          )}

          {isAccountant && request.status === "approved" && (
            <div className="mt-4 flex justify-end">
              <Button type="button" className="gap-1.5" disabled={markPaid.isPending} onClick={() => markPaid.mutate()}>
                <Banknote className="h-4 w-4" /> {markPaid.isPending ? "Marking..." : "Mark as Paid"}
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default function PaymentsPage() {
  const { user, profile } = useAuth();
  const [requestOpen, setRequestOpen] = useState(false);
  const [viewRequest, setViewRequest] = useState<PaymentRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | PaymentRequest["status"]>("all");

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const isAccountant = (profile?.department ?? "").trim().toLowerCase() === "accountant";

  const { data: projects = [] } = useQuery({
    queryKey: ["payments-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name").eq("status", "active").order("name");
      if (error) throw error;
      return (data ?? []) as Project[];
    },
    enabled: !!user,
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["payment-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_requests").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentRequest[];
    },
    enabled: !!user,
  });

  const counts = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    paid: requests.filter((r) => r.status === "paid").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  }), [requests]);

  const filtered = useMemo(
    () => (statusFilter === "all" ? requests : requests.filter((r) => r.status === statusFilter)),
    [requests, statusFilter]
  );

  if (!user) return null;

  return (
    <AnimatedPage className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-xl sm:text-2xl font-bold text-ink-primary">Payments</h1>
          <p className="text-sm text-ink-muted">
            {isAdmin || isAccountant ? "Review and process payment requests." : "Request and track your payment requests."}
          </p>
        </div>
        <Button onClick={() => setRequestOpen(true)} className="gap-1.5 h-9 sm:h-10 self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Request Payment
        </Button>
      </div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-5">
        <motion.div variants={staggerItem}><StatCard title="Total" value={counts.total} icon={Wallet} /></motion.div>
        <motion.div variants={staggerItem}><StatCard title="Pending" value={counts.pending} icon={Clock} iconColor="text-warning" iconBg="bg-warning-light" /></motion.div>
        <motion.div variants={staggerItem}><StatCard title="Approved" value={counts.approved} icon={CheckCircle2} iconColor="text-primary" iconBg="bg-accent-light" /></motion.div>
        <motion.div variants={staggerItem}><StatCard title="Paid" value={counts.paid} icon={Banknote} iconColor="text-success" iconBg="bg-success-light" /></motion.div>
        <motion.div variants={staggerItem}><StatCard title="Rejected" value={counts.rejected} icon={XCircle} iconColor="text-destructive" iconBg="bg-destructive/10" /></motion.div>
      </motion.div>

      <div className="rounded-card border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold text-ink-primary">
            {isAdmin || isAccountant ? "All requests" : "My requests"}
          </h2>
          <div className="flex items-center gap-1.5 text-sm">
            <Filter className="h-3.5 w-3.5 text-ink-muted" />
            {(["all", "pending", "approved", "paid", "rejected"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                  statusFilter === s ? "bg-primary text-primary-foreground" : "text-ink-muted hover:bg-muted"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? null : filtered.length === 0 ? (
          <EmptyState icon={Wallet} title="No payment requests" description="Requests you submit (or, for admins/accountants, everyone's requests) will show up here." />
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <div
                key={r.id}
                onClick={() => setViewRequest(r)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") setViewRequest(r); }}
                className="cursor-pointer rounded-lg border border-border p-4 transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink-primary">₹{formatAmount(r.amount)}</p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-ink-muted">{r.purpose}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {(isAdmin || isAccountant) && r.requester_name ? `${r.requester_name} · ` : ""}
                      {r.project_name ? `${r.project_name} · ` : ""}
                      {format(new Date(r.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <RequestPaymentModal open={requestOpen} onClose={() => setRequestOpen(false)} projects={projects} />
      <PaymentDetailModal request={viewRequest} onClose={() => setViewRequest(null)} isAdmin={isAdmin} isAccountant={isAccountant} />
    </AnimatedPage>
  );
}
