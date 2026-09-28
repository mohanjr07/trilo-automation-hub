// Supabase edge function: send-push
//
// Called by the `notifications_send_push` Postgres trigger whenever a
// new row is inserted into `public.notifications`. Looks up every FCM
// token for that user in `push_tokens` and sends each one a push via
// Firebase Cloud Messaging's HTTP v1 API, using a service-account
// (OAuth2) credential rather than the old legacy server key.
//
// Deploy with:
//   npx supabase functions deploy send-push --project-ref jhtfhjfwjsutkwebmrgv
//
// Requires the secret FCM_SERVICE_ACCOUNT to be set to the full JSON
// contents of a Firebase service-account key (Firebase Console ->
// Project settings -> Service accounts -> Generate new private key):
//   npx supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)" --project-ref jhtfhjfwjsutkwebmrgv

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FCM_SERVICE_ACCOUNT_RAW = Deno.env.get("FCM_SERVICE_ACCOUNT");

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encHeader = base64url(JSON.stringify(header));
  const encClaim = base64url(JSON.stringify(claim));
  const unsigned = `${encHeader}.${encClaim}`;

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );

  const jwt = `${unsigned}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to get FCM access token: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  return json.access_token as string;
}

Deno.serve(async (req) => {
  try {
    if (!FCM_SERVICE_ACCOUNT_RAW) {
      return new Response(JSON.stringify({ error: "FCM_SERVICE_ACCOUNT secret not set" }), { status: 500 });
    }

    const { user_id, title, body, reference_id } = await req.json();
    if (!user_id || !title || !body) {
      return new Response(JSON.stringify({ error: "user_id, title and body are required" }), { status: 400 });
    }

    const sa: ServiceAccount = JSON.parse(FCM_SERVICE_ACCOUNT_RAW);
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: tokens, error } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", user_id);

    if (error) throw error;
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no tokens for user" }), { status: 200 });
    }

    const accessToken = await getAccessToken(sa);

    const results = await Promise.all(
      tokens.map(async (row) => {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              message: {
                token: row.token,
                notification: { title, body },
                data: reference_id ? { reference_id: String(reference_id) } : undefined,
                android: { priority: "high" },
              },
            }),
          },
        );

        if (!res.ok) {
          const errText = await res.text();
          // A token that's no longer valid (app uninstalled, etc.) — clean it up.
          if (res.status === 404 || errText.includes("UNREGISTERED") || errText.includes("NOT_FOUND")) {
            await supabase.from("push_tokens").delete().eq("token", row.token);
          }
          return { token: row.token, ok: false, error: errText };
        }
        return { token: row.token, ok: true };
      }),
    );

    return new Response(JSON.stringify({ sent: results.filter((r) => r.ok).length, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
