import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// --- Minimal service-account → OAuth2 access token exchange -----------------
// FCM's modern "v1" send API (the old server-key API was shut down by Google)
// requires a short-lived OAuth2 access token signed with a Firebase service
// account's private key. This does that by hand with Web Crypto so we don't
// need the (Node-only) firebase-admin SDK inside a Deno edge function.

function base64url(bytes: Uint8Array | string): string {
  const b = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let str = "";
  for (const byte of b) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64url(new Uint8Array(signature))}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const firebaseSaJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");

    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase config" }, 500);
    if (!firebaseSaJson) return json({ success: true, skipped: "no_firebase_config" });

    const payload = await req.json();
    const record = payload.record ?? payload;
    const { user_id, title, body, type, reference_id } = record ?? {};
    if (!user_id || !title) return json({ error: "Missing user_id or title" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: tokens } = await admin
      .from("device_push_tokens")
      .select("id, token")
      .eq("user_id", user_id);

    if (!tokens || tokens.length === 0) {
      return json({ success: true, skipped: "no_device_tokens" });
    }

    const serviceAccount = JSON.parse(firebaseSaJson);
    const accessToken = await getAccessToken(serviceAccount);
    const projectId = serviceAccount.project_id;

    const staleTokenIds: string[] = [];
    const results = await Promise.all(
      tokens.map(async (row: { id: string; token: string }) => {
        const resp = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              message: {
                token: row.token,
                notification: { title, body: body ?? "" },
                data: {
                  type: type ?? "system",
                  reference_id: reference_id ?? "",
                  route: "/notifications",
                },
                android: {
                  priority: "high",
                  notification: { sound: "default", channel_id: "default" },
                },
              },
            }),
          }
        );
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          // UNREGISTERED / INVALID_ARGUMENT usually means the app was
          // uninstalled or the token rotated — stop retrying it.
          const status = err?.error?.status;
          if (status === "UNREGISTERED" || status === "NOT_FOUND") staleTokenIds.push(row.id);
          return { ok: false, error: err };
        }
        return { ok: true };
      })
    );

    if (staleTokenIds.length > 0) {
      await admin.from("device_push_tokens").delete().in("id", staleTokenIds);
    }

    return json({ success: true, sent: results.filter((r) => r.ok).length, total: tokens.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("send-push-notification error:", message);
    return json({ error: message }, 500);
  }
});
