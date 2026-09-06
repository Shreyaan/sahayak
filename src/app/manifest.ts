import type { MetadataRoute } from "next";

/**
 * Identity only: a name and icon for the home screen, and the app's own colours
 * instead of browser chrome. Deliberately no service worker — caching a case
 * would let Sahayak show a stale step as if it were current, which is the one
 * thing this product must never do.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sahayak",
    short_name: "Sahayak",
    description: "Know where to go, what to ask, and what proof to bring back.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f1e7",
    theme_color: "#2f6b4f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
