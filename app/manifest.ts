import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Ausgeben",
    short_name: "Ausgeben",
    description: "A private, phone-first expense tracker for everyday life.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f2efe7",
    theme_color: "#0d3f37",
    categories: ["finance", "productivity"],
    icons: [
      {
        src: "/icon.png",
        sizes: "256x256",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
