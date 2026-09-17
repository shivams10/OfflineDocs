import type { MetadataRoute } from "next";

/** Served at /manifest.webmanifest. Colours mirror `viewport.themeColor` in
 *  layout.tsx, so the splash screen matches the app's own background. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DocSync",
    short_name: "DocSync",
    description: "Offline-first collaborative document editor",
    /* Not "/": that route only ever redirects, and an installed launch should
       not depend on a round trip it may be unable to make. */
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#f6f7f9",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      /* Android crops icons to the platform shape, so this variant is full-bleed
         with the glyph inside the 80% safe zone. */
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
