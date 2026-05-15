import { useEffect, useRef } from "react";
import { useAuth } from "../context/auth-context";
import { useNotifications } from "../context/notification-context";
import { api } from "../lib/api";

/**
 * Converts a base64 VAPID public key to Uint8Array.
 * Duplicated here to avoid importing the full usePWA hook.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Syncs the auth user id into the NotificationProvider.
 * Also auto-subscribes to push notifications when user is logged in
 * and permission is already granted — without loading the full usePWA hook,
 * which would duplicate Service Worker registration and Canvas operations.
 */
export function NotificationSync() {
  const { user } = useAuth();
  const { setUserId } = useNotifications();
  const subscribedRef = useRef(false);

  useEffect(() => {
    setUserId(user?.id ?? null);
  }, [user?.id, setUserId]);

  // Auto-subscribe to push when user logs in and permission is already granted
  useEffect(() => {
    if (!user?.id) {
      subscribedRef.current = false;
      return;
    }
    if (subscribedRef.current) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    subscribedRef.current = true;

    (async () => {
      try {
        const { publicKey } = await api.get("/push/vapid-key");
        if (!publicKey) return;

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }
        await api.authPost("/push/subscribe", { subscription: subscription.toJSON() });
        console.log("[NotificationSync] Push auto-subscribe OK");
      } catch (err) {
        console.log("[NotificationSync] Push auto-subscribe failed (non-critical):", err);
        subscribedRef.current = false;
      }
    })();
  }, [user?.id]);

  return null;
}
