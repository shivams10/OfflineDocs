import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // shadcn's registry ships components importing `cn` from "cn" — the stock
    // engine, which doesn't know our custom @theme tokens. Point it at our
    // extended wrapper so added components work unmodified.
    resolveAlias: { cn: "./lib/utils" },
  },

  env: {
    /* Stamps the worker's cache names, so a new build retires the previous
       one's entries. "dev" locally, so restarts don't churn the cache. */
    NEXT_PUBLIC_SW_VERSION: process.env.SW_VERSION ?? "dev",
  },

  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          // Never from the HTTP cache: a stale copy would hide a deploy for the
          // length of its max-age, even with updateViaCache: "none".
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
