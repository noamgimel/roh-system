import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import Toaster from "@/components/toast/Toaster";
import NumberInputGuard from "@/components/NumberInputGuard";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"] });

export const metadata: Metadata = {
  title: "מערכת ניהול לקוחות ויתרות",
  description: "ניהול לקוחות, יתרות והנפקת מסמכים — משרד רו\"ח",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.className} bg-slate-50 text-slate-900 antialiased`}>
        <Toaster />
        <NumberInputGuard />
        {children}
      </body>
    </html>
  );
}
