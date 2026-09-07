import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GroundGraph",
  description: "Hybrid Agentic GraphRAG system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
