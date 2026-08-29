import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sahayak",
  description: "Sarkari kaam, ek baat-cheet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hi">
      <body>{children}</body>
    </html>
  );
}
