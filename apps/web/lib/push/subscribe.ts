import type {
  PushSubscriptionRequest,
  VapidKeyResponse,
} from "@docsync/shared";
import { API } from "@/constants/routes";
import { apiFetch, apiGet, apiPost } from "@/lib/api/client";

/** Where the worker is served from. Phase 2 owns the file; the path is the contract. */
const SERVICE_WORKER_PATH = "/sw.js";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * VAPID keys are base64url; `applicationServerKey` wants raw bytes. Browsers do
 * not do this conversion for you and the failure mode if you skip it is an opaque
 * `InvalidCharacterError` at subscribe time.
 */
function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);

  // Allocated explicitly rather than via Uint8Array.from, so the buffer type is a
  // plain ArrayBuffer — applicationServerKey rejects a SharedArrayBuffer-backed view.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register(SERVICE_WORKER_PATH);
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  const { publicKey } = await apiGet<VapidKeyResponse>(API.pushVapidKey);
  return publicKey;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration(
    SERVICE_WORKER_PATH,
  );
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Asks for permission, subscribes, and registers the subscription server-side.
 *
 * Order matters: the browser subscription is created first and only then sent to
 * the server, so a failed API call leaves a local subscription we can retry with
 * rather than a server row pointing at an endpoint that was never created.
 */
export async function enablePush(): Promise<void> {
  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) throw new Error("push_not_configured");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("permission_denied");

  const registration = await registerServiceWorker();
  // The worker must be active before `pushManager.subscribe()` will resolve.
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      // Required by every browser that implements Web Push: a subscription that
      // could deliver silent pushes is not allowed.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(publicKey),
    }));

  const json = subscription.toJSON();
  const body: PushSubscriptionRequest = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
  };

  await apiPost(API.pushSubscribe, body);
}

/**
 * Unsubscribes locally and server-side. The server row goes first: if the local
 * unsubscribe then fails, we have stopped sending rather than left a live
 * endpoint the user believes is off.
 */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;

  await apiFetch(API.pushSubscribe, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });

  await subscription.unsubscribe();
}
