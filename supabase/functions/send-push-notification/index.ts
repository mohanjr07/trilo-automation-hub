import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const BodySchema = z
  .object({
    record: z
      .object({
        user_id: z.string().uuid(),
        title: z.string().min(1),
        body: z.string().optional(),
        type: z.string().optional(),
        reference_id: z.string().optional(),
      })
      .optional(),
    user_id: z.string().uuid().optional(),
    title: z.string().min(1).optional(),
    body: z.string().optional(),
    type: z.string().optional(),
    reference_id: z.string().optional(),
  })
  .passthrough();

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const record = parsed.data.record ?? parsed.data;
    const { user_id, title, body, type, reference_id } = record;

    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: "Missing user_id or title" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase config" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const connectionApiKey = Deno.env.get("FIREBASE_MESSAGING_API_KEY");
    if (!lovableApiKey || !connectionApiKey) {
      return new Response(
        JSON.stringify({
          error: "Missing Firebase Messaging connector config. Connect Firebase Messaging in project settings.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: tokens } = await admin
      .from("device_push_tokens")
      .select("id, token")
      .eq("user_id", user_id);

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, skipped: "no_device_tokens" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const staleTokenIds: string[] = [];
    const results = await Promise.all(
      tokens.map(async (row: { id: string; token: string }) => {
        const resp = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "X-Connection-Api-Key": connectionApiKey,
            "Content-Type": "application/json",
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
        });

        if (!resp.ok) {
          const errorBody = await resp.text();
          console.error(`FCM send failed [${resp.status}]: ${errorBody}`);
          // 404 UNREGISTERED or 400 INVALID_ARGUMENT usually means the token is stale.
          if (resp.status === 404 || resp.status === 400) {
            staleTokenIds.push(row.id);
          }
          return { ok: false, error: errorBody };
        }
        return { ok: true };
      })
    );

    if (staleTokenIds.length > 0) {
      await admin.from("device_push_tokens").delete().in("id", staleTokenIds);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: results.filter((r) => r.ok).length,
        total: tokens.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("send-push-notification error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
