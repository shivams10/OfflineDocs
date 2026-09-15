/*
 * Push notification handlers — Phase 3.
 *
 * OWNERSHIP NOTE. This file is deliberately self-contained and holds *only* the
 * push and notificationclick behaviour. Phase 2 owns `sw.js` (precaching, fetch
 * strategies, Background Sync); it pulls this in with one `importScripts` line at
 * the top of that file. Keeping the two apart means the offline work and the push
 * work can land independently without either rewriting the other's service worker.
 *
 * Anything cache- or fetch-related belongs in sw.js, not here.
 */

/** Must match the client's `ROUTES.doc`. */
function docPath(docId) {
  return `/doc/${docId}`;
}

/**
 * Is the document this notification is about already open and focused?
 *
 * There is no server-side "active connection" to filter on — no persistent
 * transport exists in this design — so suppression is decided here, on the
 * receiving device, where the answer is actually knowable (techspec 6).
 */
async function findFocusedDocClient(docId) {
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  return clientList.find((client) => {
    if (!client.focused) return false;
    try {
      return new URL(client.url).pathname === docPath(docId);
    } catch {
      return false;
    }
  });
}

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // A push we cannot parse is not worth interrupting someone over, and
    // showing a blank notification would be worse than showing none.
    return;
  }

  const { docId, docTitle, editorName, changeSummary } = payload;
  if (!docId) return;

  event.waitUntil(
    (async () => {
      const focused = await findFocusedDocClient(docId);

      if (focused) {
        // Already looking at it: an OS notification for the thing on screen is
        // noise. Hand it to the page instead, which shows an in-app notice.
        focused.postMessage({ type: "docsync:doc-saved", payload });
        return;
      }

      await self.registration.showNotification(docTitle || "DocSync", {
        body: `${editorName} ${changeSummary}`,
        // Collapses repeats for the same document: a second save replaces the
        // first notification rather than stacking another one up.
        tag: `docsync-doc-${docId}`,
        renotify: true,
        data: { docId },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const docId = event.notification.data?.docId;
  if (!docId) return;

  const target = docPath(docId);

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Focus a tab that already has this document rather than opening a second
      // one — a duplicate tab of a document being edited is its own small disaster.
      for (const client of clientList) {
        try {
          if (new URL(client.url).pathname === target) {
            await client.focus();
            return;
          }
        } catch {
          // A client with an unparseable URL is simply not a match.
        }
      }

      // Otherwise reuse any open window and navigate it, falling back to a new one.
      const existing = clientList[0];
      if (existing && "navigate" in existing) {
        await existing.focus();
        await existing.navigate(target);
        return;
      }

      await self.clients.openWindow(target);
    })(),
  );
});
