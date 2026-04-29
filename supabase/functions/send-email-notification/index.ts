import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

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
      <a href="https://magicaislestasks.lovable.app/notifications"
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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase config" }, 500);
    if (!lovableApiKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);
    if (!resendApiKey) return json({ error: "RESEND_API_KEY not configured" }, 500);

    const payload = await req.json();
    const record = payload.record ?? payload;
    const { id: notificationId, user_id, title, body } = record ?? {};

    if (!user_id || !title) return json({ error: "Missing user_id or title" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Skip if already emailed
    if (notificationId) {
      const { data: existing } = await admin
        .from("notifications").select("email_sent").eq("id", notificationId).maybeSingle();
      if (existing?.email_sent) return json({ success: true, skipped: "already_sent" });
    }

    // Look up recipient
    const { data: profile } = await admin
      .from("profiles").select("email, full_name, is_active").eq("id", user_id).maybeSingle();

    if (!profile?.email) return json({ success: true, skipped: "no_email" });
    if (profile.is_active === false) return json({ success: true, skipped: "inactive" });

    const html = buildHtml(title, body ?? "", profile.full_name ?? "there");

    const resp = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
        "X-Connection-Api-Key": resendApiKey,
      },
      body: JSON.stringify({
        from: "Magic Aisles <notifications@magicaisles.com>",
        to: [profile.email],
        subject: title,
        html,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("Resend error:", resp.status, data);
      return json({ error: "Failed to send email", status: resp.status, details: data }, 502);
    }

    if (notificationId) {
      await admin.from("notifications").update({ email_sent: true }).eq("id", notificationId);
    }

    return json({ success: true, email_id: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("send-email-notification error:", message);
    return json({ error: message }, 500);
  }
});
