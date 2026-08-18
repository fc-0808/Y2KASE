import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Kawaii & Y2K Phone Cases`,
    short_name: SITE_NAME,
    description:
      "Kawaii, Y2K and holographic phone cases, charms and accessories.",
    start_url: "/",
    display: "standalone",
    background_color: "#fdf3fb",
    theme_color: "#ff3ea5",
    categories: ["shopping", "lifestyle"],
    icons: [
      {
        src: "/brand/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
