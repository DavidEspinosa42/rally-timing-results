import type { MetadataRoute } from "next";

// Chrome offers installation only when a manifest like this exists, and the
// device must be installed before it is set up: on iOS the Home Screen app
// has its own storage, so a key made in a Safari tab would be a different one.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rally Timing Results",
    short_name: "Timing Results",
    description:
      "Enter rally times read from the event's timing equipment. Each entry is signed on this device.",
    start_url: "/entry",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffd100",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
      {
        src: "/icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
