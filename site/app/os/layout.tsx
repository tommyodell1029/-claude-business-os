import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./os.css";

export const metadata: Metadata = {
  title: { absolute: "Money OS" },
  description: "Private Money OS for the LaunchPad Local owner.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b1117" };

export default function OsLayout({ children }: { children: ReactNode }) {
  return children;
}
