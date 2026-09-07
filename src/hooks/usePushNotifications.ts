import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Registers this device for Firebase Cloud Messaging push notifications
 * (Android/iOS only — no-op on web/desktop, which already gets in-app
 * toasts + Web Notification API via NotificationBell). Mounted once, in
 * AppLayout, so it runs for every signed-in user on every native platform.
 *
 * Saves the FCM token to `device_push_tokens` so the send-push-notification
 * edge function knows where to deliver a push when a `notifications` row is
 * inserted for this user (e.g. a sales rep's manager gets pushed the moment
 * that rep checks in or logs a site visit).
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;

    let listeners: Array<{ remove: () => void }> = [];
    let cancelled = false;

    (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");

      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === "prompt") {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== "granted" || cancelled) return;

      await PushNotifications.register();

      const regListener = await PushNotifications.addListener("registration", async (token) => {
        await supabase.from("device_push_tokens").upsert(
          {
            user_id: user.id,
            token: token.value,
            platform: Capacitor.getPlatform(),
          },
          { onConflict: "token" }
        );
      });

      const errListener = await PushNotifications.addListener("registrationError", (err) => {
        console.error("Push registration error:", err);
      });

      // App is open/foregrounded when the push arrives — show the same
      // in-app toast NotificationBell uses for realtime inserts (FCM alone
      // won't display a heads-up banner while the app is in the foreground).
      const recvListener = await PushNotifications.addListener(
        "pushNotificationReceived",
        (notification) => {
          toast(notification.title ?? "Magic Aisles", {
            description: notification.body ?? "",
          });
        }
      );

      // User tapped the system notification tray entry.
      const actionListener = await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          const route = action.notification.data?.route || "/notifications";
          navigate(route);
        }
      );

      listeners = [regListener, errListener, recvListener, actionListener];
    })();

    return () => {
      cancelled = true;
      listeners.forEach((l) => l.remove());
    };
  }, [user?.id, navigate]);
}
