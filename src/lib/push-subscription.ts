import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = "BNxR5zHhzJdpN8MN4Qr9QyRNp4Dvt-tDb8bJR8jGcBMFrb8WKtSN9ibxEKKWt7dcbJg2LvHKuwFT2mNmbPg8qNw";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

/** Register service worker and subscribe to Web Push */
export async function subscribeToPush(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("Push not supported");
      return false;
    }

    // Register the push service worker
    const registration = await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    // Save to DB
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const subJson = subscription.toJSON();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: subJson.endpoint!,
        p256dh: subJson.keys!.p256dh!,
        auth: subJson.keys!.auth!,
      },
      { onConflict: "user_id,endpoint" }
    );

    if (error) {
      console.error("Failed to save push subscription:", error);
      return false;
    }

    console.log("Push subscription saved successfully");
    return true;
  } catch (err) {
    console.error("Push subscription failed:", err);
    return false;
  }
}

/** Send a push notification via edge function */
export async function triggerPushNotification(opts: {
  userId: string;
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
}) {
  try {
    const { data, error } = await supabase.functions.invoke("send-push", {
      body: {
        user_id: opts.userId,
        title: opts.title,
        body: opts.body,
        tag: opts.tag,
        data: opts.data,
        requireInteraction: opts.requireInteraction,
      },
    });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error("Failed to send push:", err);
    return null;
  }
}
