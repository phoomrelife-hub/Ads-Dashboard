import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AdsLayout } from "@/components/ads-layout";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  title: "Ads — Relife ERP",
  description: "Facebook Ads management & analytics",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={`${outfit.variable} ${mono.variable}`}>
      <body className="bg-[#050810] text-[#e8eaf5] antialiased min-h-screen" style={{ fontFamily: "var(--font-sans), 'Segoe UI', sans-serif" }}>
        <AdsLayout>{children}</AdsLayout>
      </body>
    </html>
  );
}
