import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, Plus, X, FileText, Download, CheckCircle2, XCircle,
  Clock, Banknote, Upload, Filter, Settings2, Gauge,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AnimatedPage, { staggerContainer, staggerItem } from "@/components/AnimatedPage";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BUCKET = "payment-receipts";

type Project = { id: string; name: string };

// "Expense category" is no longer a fixed set — admins can add their own
// from the Expense limits panel (see ExpenseTierLimitsPanel below).
// Built-in categories are grouped into two sections — "TTA (Tour Travel
// Allowance)" and "Local Conveyance" — each with its own Food / Travel /
// Accommodation / Petrol line item (group_key/group_label). "other" and
// any custom category an admin adds are ungrouped (group_key null) and
// listed on their own, outside either section.
type ExpenseCategory = string;
// rate_unit_label: null = flat max amount cap. "day" or "km" = the tier
// limit is a per-unit RATE, and the allowed amount for a request is
// rate × units (meal_count or petrol_km) — set on the Food/Petrol line
// item in each section via migration; any custom category an admin adds
// is flat by default.
type ExpenseCategoryDef = {
  key: ExpenseCategory; label: string; is_builtin: boolean; sort_order: number;
  rate_unit_label: "day" | "km" | null; group_key: string | null; group_label: string | null;
};

type TierLimit = { tier: 1 | 2 | 3; category: ExpenseCategory; max_amount: number | null };

type PaymentRequest = {
  id: string;
  requester_id: string;
  requester_name: string | null;
  payment_for: "project" | "expense";
  project_id: string | null;
  project_name: string | null;
  expense_category: ExpenseCategory | null;
  petrol_km: number | null;
  meal_count: number | null;
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

const categoryLabel = (categories: ExpenseCategoryDef[], key: string | null) => {
  const c = key ? categories.find((c) => c.key === key) : undefined;
  if (!c) return key || "—";
  return c.group_label ? `${c.group_label} – ${c.label}` : c.label;
};

function StatusBadge({ status }: { status: PaymentRequest["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn("flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", meta.bg, meta.text)}>
      <meta.icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

/** Request Payment — open to any signed-in user. */
function RequestPaymentModal({
  open, onClose, projects, tierLimits, categories,
}: {
  open: boolean; onClose: () => void; projects: Project[]; tierLimits: TierLimit[]; categories: ExpenseCategoryDef[];
}) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [paymentFor, setPaymentFor] = useState<"project" | "expense">("project");
  const [projectId, setProjectId] = useState<string>("");
  const [manualProjectName, setManualProjectName] = useState("");
  const [category, setCategory] = useState<ExpenseCategory | "">("");
  const [petrolKm, setPetrolKm] = useState("");
  const [mealCount, setMealCount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isOtherProject = projectId === "__other__";

  // Split the flat categories list into the two sections (TTA / Local
  // Conveyance) plus whatever's ungrouped (Others, and any custom
  // category an admin adds), for the grouped dropdown below.
  const groupedCategories = useMemo(() => {
    const groupOrder: { key: string; label: string }[] = [];
    const byGroup: Record<string, ExpenseCategoryDef[]> = {};
    const ungrouped: ExpenseCategoryDef[] = [];
    for (const c of categories) {
      if (c.group_key) {
        if (!byGroup[c.group_key]) {
          byGroup[c.group_key] = [];
          groupOrder.push({ key: c.group_key, label: c.group_label ?? c.group_key });
        }
        byGroup[c.group_key].push(c);
      } else {
        ungrouped.push(c);
      }
    }
    return { groups: groupOrder.map((g) => ({ ...g, items: byGroup[g.key] })), ungrouped };
  }, [categories]);

  // Is the picked category rate-based (Food = ₹/meal, Petrol = ₹/km)?
  const rateUnitLabel = useMemo(
    () => (category ? categories.find((c) => c.key === category)?.rate_unit_label ?? null : null),
    [category, categories]
  );

  // Each requester's cap/rate comes from their own Expense Tier
  // (1/2/3, set by an admin on the Users page) — different tiers can
  // have different rates for the same category.
  const myTier: 1 | 2 | 3 = profile?.expense_tier ?? 1;

  // The max for the picked category at the requester's tier —
  // null/undefined means "no cap" (either the admin hasn't set a limit
  // for this category/tier yet, or — for a rate-based category — the
  // unit count (meals/km) hasn't been entered yet). For a rate-based
  // category this is the RATE × units.
  const capForCategory = useMemo(() => {
    if (!category || category === "other") return null;
    const row = tierLimits.find((t) => t.category === category && t.tier === myTier);
    if (row?.max_amount == null) return null;
    if (rateUnitLabel === "day") {
      const units = parseFloat(mealCount);
      return !isNaN(units) && units > 0 ? row.max_amount * units : null;
    }
    if (rateUnitLabel === "km") {
      const units = parseFloat(petrolKm);
      return !isNaN(units) && units > 0 ? row.max_amount * units : null;
    }
    return row.max_amount;
  }, [category, tierLimits, rateUnitLabel, mealCount, petrolKm, myTier]);

  // The raw per-unit rate itself, for display before units are entered.
  const rateForCategory = useMemo(() => {
    if (!category || !rateUnitLabel) return null;
    const row = tierLimits.find((t) => t.category === category && t.tier === myTier);
    return row?.max_amount ?? null;
  }, [category, tierLimits, rateUnitLabel, myTier]);

  const reset = () => {
    setPaymentFor("project");
    setProjectId("");
    setManualProjectName("");
    setCategory("");
    setPetrolKm("");
    setMealCount("");
    setPurpose("");
    setAmount("");
    setFile(null);
  };

  // Blocks typing an amount over the requester's tier cap for the picked
  // category, rather than only rejecting it on submit.
  const onAmountChange = (v: string) => {
    if (capForCategory != null) {
      const n = parseFloat(v);
      if (!isNaN(n) && n > capForCategory) {
        toast.error(`Capped at the limit for ${categoryLabel(categories, category)}: ₹${formatAmount(capForCategory)}`);
        setAmount(String(capForCategory));
        return;
      }
    }
    setAmount(v);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (!purpose.trim()) { toast.error("Enter a purpose / description"); return; }
    if (!amountNum || amountNum <= 0) { toast.error("Enter a valid amount"); return; }
    if (capForCategory != null && amountNum > capForCategory) {
      toast.error(`Amount exceeds the limit for ${categoryLabel(categories, category)}`);
      return;
    }
    if (paymentFor === "project" && isOtherProject && !manualProjectName.trim()) { toast.error("Type the project name"); return; }
    if (paymentFor === "expense" && !category) { toast.error("Select an expense category"); return; }
    if (paymentFor === "expense" && rateUnitLabel === "km" && (!petrolKm || parseFloat(petrolKm) <= 0)) {
      toast.error("Enter the total KM for petrol");
      return;
    }
    if (paymentFor === "expense" && rateUnitLabel === "day" && (!mealCount || parseFloat(mealCount) <= 0)) {
      toast.error("Enter the number of days");
      return;
    }
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
        payment_for: paymentFor,
        // "Other" project -> no project_id, but the typed name is stored
        // directly on project_name. The server-side trigger only overwrites
        // project_name when project_id is set, so a manually typed name is
        // left exactly as submitted here.
        project_id: paymentFor === "project" && !isOtherProject && projectId ? projectId : null,
        project_name: paymentFor === "project" && isOtherProject ? manualProjectName.trim() : null,
        expense_category: paymentFor === "expense" ? category : null,
        petrol_km: paymentFor === "expense" && rateUnitLabel === "km" ? parseFloat(petrolKm) : null,
        meal_count: paymentFor === "expense" && rateUnitLabel === "day" ? parseFloat(mealCount) : null,
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
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-primary">Payment for *</label>
                <Select
                  value={paymentFor}
                  onValueChange={(v) => {
                    setPaymentFor(v as "project" | "expense");
                    setProjectId(""); setManualProjectName(""); setCategory(""); setPetrolKm(""); setMealCount("");
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentFor === "project" ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">Project</label>
                  <Select value={projectId || undefined} onValueChange={setProjectId}>
                    <SelectTrigger><SelectValue placeholder="Select a project (optional)" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      <SelectItem value="__other__">Other…</SelectItem>
                    </SelectContent>
                  </Select>
                  {projects.length === 0 && !isOtherProject && (
                    <p className="mt-1.5 text-xs text-ink-muted">
                      No active projects found — pick "Other…" to type one, or leave this blank.
                    </p>
                  )}
                  {isOtherProject && (
                    <Input
                      className="mt-2"
                      value={manualProjectName}
                      onChange={(e) => setManualProjectName(e.target.value)}
                      placeholder="Type the project name"
                      autoFocus
                    />
                  )}
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-primary">Expense category *</label>
                  <Select value={category || undefined} onValueChange={(v) => { setCategory(v as ExpenseCategory); setPetrolKm(""); setMealCount(""); }}>
                    <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                    <SelectContent>
                      {groupedCategories.groups.map((g) => (
                        <SelectGroup key={g.key}>
                          <SelectLabel>{g.label}</SelectLabel>
                          {g.items.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                        </SelectGroup>
                      ))}
                      {groupedCategories.ungrouped.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {rateUnitLabel === "km" && (
                    <div className="mt-2">
                      <label className="mb-1.5 block text-sm font-medium text-ink-primary">Total KM *</label>
                      <Input
                        type="number" min="0.1" step="0.1"
                        value={petrolKm}
                        onChange={(e) => setPetrolKm(e.target.value)}
                        placeholder="e.g. 42"
                      />
                    </div>
                  )}
                  {rateUnitLabel === "day" && (
                    <div className="mt-2">
                      <label className="mb-1.5 block text-sm font-medium text-ink-primary">Number of days *</label>
                      <Input
                        type="number" min="0.5" step="0.5"
                        value={mealCount}
                        onChange={(e) => setMealCount(e.target.value)}
                        placeholder="e.g. 3"
                      />
                    </div>
                  )}
                  {rateUnitLabel && rateForCategory != null && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-muted">
                      <Gauge className="h-3 w-3" /> Rate for {categoryLabel(categories, category)} (Tier {myTier}): ₹{formatAmount(rateForCategory)} per {rateUnitLabel}
                      {capForCategory != null && <> — max ₹{formatAmount(capForCategory)} for this request</>}
                    </p>
                  )}
                  {!rateUnitLabel && capForCategory != null && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-muted">
                      <Gauge className="h-3 w-3" /> Limit for {categoryLabel(categories, category)}: ₹{formatAmount(capForCategory)}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-primary">Purpose / Description *</label>
                <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} placeholder="What is this payment for?" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-primary">Amount *</label>
                <Input
                  type="number" min="0.01" step="0.01" max={capForCategory ?? undefined}
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value)}
                  placeholder="0.00"
                />
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
  request, onClose, isAdmin, isAccountant, categories,
}: {
  request: PaymentRequest | null; onClose: () => void; isAdmin: boolean; isAccountant: boolean; categories: ExpenseCategoryDef[];
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
            <div>
              <p className="text-xs font-medium text-ink-muted">{request.payment_for === "expense" ? "Expense category" : "Project"}</p>
              <p className="text-sm text-ink-primary">
                {request.payment_for === "expense"
                  ? categoryLabel(categories, request.expense_category)
                  : (request.project_name ?? "—")}
              </p>
            </div>
            {request.payment_for === "expense" && request.petrol_km != null && (
              <div><p className="text-xs font-medium text-ink-muted">Total KM</p><p className="text-sm text-ink-primary">{request.petrol_km}</p></div>
            )}
            {request.payment_for === "expense" && request.meal_count != null && (
              <div><p className="text-xs font-medium text-ink-muted">Days</p><p className="text-sm text-ink-primary">{request.meal_count}</p></div>
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

  // Uses a SECURITY DEFINER RPC rather than a direct `.from("projects")`
  // select — the projects table's own RLS only lets a user read projects
  // they're a member of (or all, if admin), but anyone should be able to
  // name any active project on a payment request regardless of team
  // membership. The RPC exposes only id + name, nothing else.
  const { data: projects = [] } = useQuery({
    queryKey: ["payments-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_active_projects_for_payment_requests");
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

  // Readable by everyone (needed so a requester's amount field can be
  // capped client-side); only admins can write to this table (RLS).
  const { data: tierLimits = [] } = useQuery({
    queryKey: ["expense-tier-limits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_tier_limits").select("tier, category, max_amount");
      if (error) throw error;
      return (data ?? []) as TierLimit[];
    },
    enabled: !!user,
  });

  // The expense category list — built-ins (Food/Travel/Accommodation/
  // Petrol/Others) plus any an admin has added. Readable by everyone
  // (needed for the request form's dropdown); only admins can add/remove.
  const { data: categories = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_categories").select("key, label, is_builtin, sort_order, rate_unit_label, group_key, group_label").order("sort_order");
      if (error) throw error;
      return (data ?? []) as ExpenseCategoryDef[];
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
                      {r.payment_for === "expense"
                        ? (r.expense_category ? `${categoryLabel(categories, r.expense_category)} · ` : "")
                        : (r.project_name ? `${r.project_name} · ` : "")}
                      {format(new Date(r.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isAdmin && <ExpenseTierLimitsPanel tierLimits={tierLimits} categories={categories} />}

      <RequestPaymentModal open={requestOpen} onClose={() => setRequestOpen(false)} projects={projects} tierLimits={tierLimits} categories={categories} />
      <PaymentDetailModal request={viewRequest} onClose={() => setViewRequest(null)} isAdmin={isAdmin} isAccountant={isAccountant} categories={categories} />
    </AnimatedPage>
  );
}

/** Admin-only: edit each tier's max claimable amount per expense category,
 * and add or remove categories themselves. Limit values start blank (no
 * cap) until set here — a blank cell means unrestricted for that
 * tier/category. User → tier assignment happens on the Users page (Edit
 * User → Expense Tier), not here. */
function ExpenseTierLimitsPanel({ tierLimits, categories: allCategories }: { tierLimits: TierLimit[]; categories: ExpenseCategoryDef[] }) {
  const queryClient = useQueryClient();
  // "Others" has no limit (it's the free-manual-entry fallback), so
  // it doesn't get a row in this grid — only categories a claim can be
  // capped on. Each category now has its own rate per Tier 1/2/3 — a
  // user's tier (set on the Users page) decides which column applies
  // to them.
  const categories = allCategories.filter((c) => c.key !== "other");
  const TIERS = [1, 2, 3] as const;
  // Split into the two sections (TTA / Local Conveyance) plus whatever's
  // ungrouped (any custom category an admin adds without a section).
  const sections = useMemo(() => {
    const order: { key: string; label: string }[] = [];
    const byGroup: Record<string, ExpenseCategoryDef[]> = {};
    const ungrouped: ExpenseCategoryDef[] = [];
    for (const c of categories) {
      if (c.group_key) {
        if (!byGroup[c.group_key]) { byGroup[c.group_key] = []; order.push({ key: c.group_key, label: c.group_label ?? c.group_key }); }
        byGroup[c.group_key].push(c);
      } else {
        ungrouped.push(c);
      }
    }
    return { groups: order.map((g) => ({ ...g, items: byGroup[g.key] })), ungrouped };
  }, [categories]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);

  const editKey = (tier: number, category: string) => `${tier}:${category}`;

  const valueFor = (tier: number, category: string) =>
    tierLimits.find((t) => t.category === category && t.tier === tier)?.max_amount;

  const [edits, setEdits] = useState<Record<string, string>>({});

  const displayValue = (tier: number, category: string) => {
    const k = editKey(tier, category);
    if (k in edits) return edits[k];
    const v = valueFor(tier, category);
    return v == null ? "" : String(v);
  };

  const save = useMutation({
    mutationFn: async () => {
      const writes = Object.entries(edits).map(([k, v]) => {
        const [tierStr, category] = k.split(":");
        return {
          tier: parseInt(tierStr, 10),
          category,
          max_amount: v.trim() === "" ? null : parseFloat(v),
        };
      });
      if (writes.length === 0) return;
      const { error } = await supabase.from("expense_tier_limits").upsert(writes, { onConflict: "tier,category" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-tier-limits"] });
      toast.success("Rates saved");
      setEdits({});
    },
    onError: () => toast.error("Couldn't save rates"),
  });

  const addCategory = useMutation({
    mutationFn: async (label: string) => {
      const { error } = await supabase.rpc("add_expense_category", { p_key: label, p_label: label });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      queryClient.invalidateQueries({ queryKey: ["expense-tier-limits"] });
      toast.success("Category added");
      setNewCategoryName("");
      setAddingCategory(false);
    },
    onError: (err: any) => toast.error(err?.message ?? "Couldn't add category"),
  });

  const removeCategory = useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase.rpc("delete_expense_category", { p_key: key });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      queryClient.invalidateQueries({ queryKey: ["expense-tier-limits"] });
      toast.success("Category removed");
    },
    onError: (err: any) => toast.error(err?.message ?? "Couldn't remove category"),
  });

  const renderTable = (items: ExpenseCategoryDef[], showRemove: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[380px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-ink-muted">
            <th className="py-2 pr-1.5">Category</th>
            {TIERS.map((t) => (
              <th key={t} className="py-2 pr-1.5">Tier {t}</th>
            ))}
            <th className="py-2 pr-1.5" />
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.key} className="border-b border-border last:border-0">
              <td className="py-2 pr-1.5 font-medium text-ink-primary whitespace-nowrap">
                {c.label}
                {c.rate_unit_label && (
                  <span className="ml-1.5 rounded-full bg-accent-light px-1.5 py-0.5 text-[10px] font-medium text-primary">₹/{c.rate_unit_label}</span>
                )}
              </td>
              {TIERS.map((t) => (
                <td key={t} className="py-2 pr-1.5">
                  <Input
                    type="number" min="0" step="0.01"
                    className="h-9 w-full min-w-0"
                    placeholder="—"
                    title={c.rate_unit_label ? `Tier ${t}: ₹ per ${c.rate_unit_label}` : `Tier ${t}: flat max amount`}
                    value={displayValue(t, c.key)}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [editKey(t, c.key)]: e.target.value }))}
                  />
                </td>
              ))}
              <td className="py-2 pr-1.5">
                {showRemove && !c.is_builtin && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Remove the "${c.label}" category? Existing requests keep it, but it won't be pickable anymore.`)) {
                        removeCategory.mutate(c.key);
                      }
                    }}
                    className="text-xs text-destructive hover:underline"
                    disabled={removeCategory.isPending}
                  >
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="rounded-card border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-ink-muted" />
        <h2 className="font-heading text-lg font-semibold text-ink-primary">Expense limits</h2>
      </div>
      <p className="mb-4 text-xs text-ink-muted">
        Maximum claimable amount per category, set separately for each Expense Tier (1/2/3). A requester's own tier — assigned on the Users page — decides which column applies to them. Food is a rate per day and Petrol a rate per km (multiplied by the days or KM entered on the request); other categories are a flat cap. Leave a cell blank for no limit.
      </p>
      {sections.groups.map((g) => (
        <div key={g.key} className="mb-5">
          <h3 className="mb-2 text-sm font-semibold text-ink-primary">{g.label}</h3>
          {renderTable(g.items, false)}
        </div>
      ))}

      {sections.ungrouped.length > 0 && (
        <div>
          {sections.groups.length > 0 && <h3 className="mb-2 text-sm font-semibold text-ink-primary">Other categories</h3>}
          {renderTable(sections.ungrouped, true)}
        </div>
      )}

      {addingCategory ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="New category name, e.g. Medical"
            className="h-9 w-56"
            autoFocus
          />
          <Button
            type="button" size="sm"
            disabled={!newCategoryName.trim() || addCategory.isPending}
            onClick={() => addCategory.mutate(newCategoryName.trim())}
          >
            {addCategory.isPending ? "Adding..." : "Add"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => { setAddingCategory(false); setNewCategoryName(""); }}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingCategory(true)}
          className="mt-4 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Plus className="h-4 w-4" /> Add category
        </button>
      )}

      <div className="mt-4 flex justify-end">
        <Button type="button" disabled={Object.keys(edits).length === 0 || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving..." : "Save rates"}
        </Button>
      </div>
    </div>
  );
}
