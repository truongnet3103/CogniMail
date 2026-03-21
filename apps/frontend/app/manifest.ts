import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CogniMail",
    short_name: "CogniMail",
    description: "Đồng bộ email IMAP, tóm tắt AI và quản lý công việc.",
    start_url: "/",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#4f46e5",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
