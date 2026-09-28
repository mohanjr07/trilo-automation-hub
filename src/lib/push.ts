// Native push notifications (Android only — matches the TaskFlow app's
// approach; iOS push needs the paid Apple developer account so it's
// skipped for now). Uses @capacitor/push-notifications, already listed
// in package.json.
//
// initPush() is called once after a successful sign-in (see
// AuthContext.tsx). removePushToken() is called on sign-out so a shared
// device stops receiving another user's pushes.

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";

let currentToken: string | null = null;
let listenersRegistered = false;

export async function initPush() {
  // Only real native Android builds have a push channel — skip on web/desktop.
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;

  try {
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === "prompt") {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== "granted") return;

    if (!listenersRegistered) {
      listenersRegistered = true;

      PushNotifications.addListener("registration", async (token) => {
        currentToken = token.value;
        try {
          await supabase.rpc("claim_push_token", { p_token: token.value, p_platform: "android" });
        } catch (err) {
          console.error("Failed to save push token:", err);
        }
      });

      PushNotifications.addListener("registrationError", (err) => {
        console.error("Push registration error:", err);
      });

      // Foreground pushes: Android shows nothing automatically while the
      // app is open, so at minimum log it — the in-app bell already
      // covers the foreground case via the `notifications` table.
      PushNotifications.addListener("pushNotificationReceived", (notification) => {
        console.log("Push received in foreground:", notification);
      });

      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        console.log("Push tapped:", action.notification);
      });
    }

    await PushNotifications.register();
  } catch (err) {
    console.error("initPush failed:", err);
  }
}

export async function removePushToken() {
  if (!currentToken) return;
  try {
    await supabase.from("push_tokens").delete().eq("token", currentToken);
  } catch (err) {
    console.error("Failed to remove push token on sign-out:", err);
  } finally {
    currentToken = null;
  }
}
