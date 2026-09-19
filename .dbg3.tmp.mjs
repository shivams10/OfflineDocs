import { chromium } from "@playwright/test";
const b = await chromium.launch();
const c = await b.newContext({ storageState: "e2e/.auth/owner.json", serviceWorkers: "allow" });
const p = await c.newPage();
await p.goto("http://localhost:4000/dashboard", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(4000);
const [w] = c.serviceWorkers();
console.log("worker url:", w?.url());
w.on("console", m => console.log("[sw console]", m.type(), m.text().slice(0, 200)));
const probe = await w.evaluate(async () => {
  const out = {};
  out.state = self.registration.installing?.state ?? self.registration.active?.state ?? "none";
  out.hasPushHandler = typeof self.onpush !== "undefined";
  out.caches = await caches.keys();
  const t0 = Date.now();
  try {
    const r = await fetch(new Request("/dashboard", { cache: "reload" }));
    out.fetchStatus = r.status;
    const text = await r.text();
    out.htmlBytes = text.length;
    out.assetMatches = (text.match(/\/_next\/static\/[\w./-]+/g) || []).length;
  } catch (e) {
    out.fetchError = String(e);
  }
  out.ms = Date.now() - t0;
  return out;
});
console.log("PROBE:", JSON.stringify(probe, null, 1));
await p.waitForTimeout(3000);
await b.close();
