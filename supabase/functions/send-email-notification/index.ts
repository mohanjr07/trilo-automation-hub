import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Sends straight to Resend (no Lovable gateway since we moved off Lovable).
const RESEND_URL = "https://api.resend.com/emails";
const APP_URL = Deno.env.get("APP_URL") ?? "https://taskflow.magicaisles.com";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const buildHtml = (title: string, body: string, name: string) => `
<!doctype html>
<html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#1a1a1a;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#0f172a;padding:20px 28px;color:#ffffff;font-weight:700;font-size:18px;">
      Magic Aisles
    </div>
    <div style="padding:28px;">
      <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Hi ${escapeHtml(name)},</p>
      <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#374151;">${escapeHtml(body)}</p>
      <a href="${APP_URL}/notifications"
         style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;
                padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">
        View in Magic Aisles
      </a>
    </div>
    <div style="padding:16px 28px;background:#f9fafb;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;">
      You're receiving this because you have an account on Magic Aisles.
    </div>
  </div>
</body></html>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase config" }, 500);
    if (!resendApiKey) return json({ error: "RESEND_API_KEY not configured" }, 500);

    // The trigger calls us with the public anon key, so never trust the
    // payload: take only the notification id and read the real row.
    const payload = await req.json().catch(() => ({}));
    const notificationId = payload?.record?.id;
    if (!notificationId || typeof notificationId !== "string") {
      return json({ error: "Missing notification id" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Claim the row atomically so it's never emailed twice.
    const { data: notif } = await admin
      .from("notifications")
      .update({ email_sent: true })
      .eq("id", notificationId)
      .or("email_sent.is.null,email_sent.eq.false")
      .select("user_id, title, body")
      .maybeSingle();
    if (!notif) return json({ success: true, skipped: "not_found_or_already_sent" });
    const { user_id, title, body } = notif;

    // Look up recipient
    const { data: profile } = await admin
      .from("profiles").select("email, full_name, is_active").eq("id", user_id).maybeSingle();

    if (!profile?.email) return json({ success: true, skipped: "no_email" });
    if (profile.is_active === false) return json({ success: true, skipped: "inactive" });

    const html = buildHtml(title, body ?? "", profile.full_name ?? "there");

    const resp = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM") ?? "Magic Aisles <noreply@triloautomation.com>",
        to: [profile.email],
        subject: title,
        html,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("Resend error:", resp.status, data);
      // Release the claim so it can be retried.
      await admin.from("notifications").update({ email_sent: false }).eq("id", notificationId);
      return json({ error: "Failed to send email", status: resp.status, details: data }, 502);
    }

    return json({ success: true, email_id: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("send-email-notification error:", message);
    return json({ error: message }, 500);
  }
});
