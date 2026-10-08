import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./os.css";

export const metadata: Metadata = {
  title: { absolute: "Money OS" },
  description: "Private Money OS for the LaunchPad Local owner.",
  robots: { index: false, follow: false },
  manifest: "/os.webmanifest",
  appleWebApp: { capable: true, title: "Money OS", statusBarStyle: "default" },
  icons: { apple: "/jarvis-icon-180.png", icon: "/jarvis-icon-512.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b1117" };

export default function OsLayout({ children }: { children: ReactNode }) {
  return children;
}
