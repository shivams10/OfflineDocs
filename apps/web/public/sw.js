/*
 * DocSync service worker.
 *
 * ---------------------------------------------------------------------------
 * PHASE 2 OWNER: this file is yours. It is intentionally almost empty — Phase 3
 * needed *a* service worker to receive push, not a finished one. Add precaching,
 * the fetch strategies and Background Sync here.
 *
 * Please keep the `importScripts("/sw-push.js")` line below. Push and
 * notificationclick live in that file so the two phases don't rewrite each
 * other's worker; there is nothing cache-related in it.
 * ---------------------------------------------------------------------------
 */

importScripts("/sw-push.js");

self.addEventListener("install", () => {
  // Deliberately no skipWaiting(): a new worker must not take over mid-edit and
  // pull document state out from under someone. Phase 2 surfaces an in-app
  // "update available" banner and lets the user choose (techspec 3.2).
});

self.addEventListener("activate", (event) => {
  // Claim existing tabs so push works in the session that just granted
  // permission, instead of only after the next navigation.
  event.waitUntil(self.clients.claim());
});
