import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Hyperliquid Whale Radar",
  description: "Real-time smart-money tracking on Hyperliquid perpetuals",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
