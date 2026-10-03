import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./jarvis.css";

export const metadata: Metadata = {
  title: { absolute: "Jarvis" },
  description: "Private assistant for the LaunchPad Local owner.",
  robots: { index: false, follow: false },
  manifest: "/jarvis.webmanifest",
  appleWebApp: { capable: true, title: "Jarvis", statusBarStyle: "black-translucent" },
  icons: { apple: "/jarvis-icon-180.png", icon: "/jarvis-icon-512.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#02070d" };

export default function JarvisLayout({ children }: { children: ReactNode }) {
  return children;
}
