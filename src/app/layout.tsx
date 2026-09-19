import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SessionExpiryGuard } from "@/components/session-expiry-guard";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Natural Intellects | Employee Reporting & Workforce Management",
  description: "Natural Intellects helps organizations capture daily work, understand workforce activity, and manage reporting with confidence.",
  keywords: ["Natural Intellects", "employee reporting", "workforce management", "daily work reports", "team operations"],
  authors: [{ name: "Natural Intellects Ltd" }],
  openGraph: {
    title: "Natural Intellects | Employee Reporting & Workforce Management",
    description: "Capture daily work, understand workforce activity, and manage reporting with confidence.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="bg-background"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body
        className={`${inter.variable} antialiased`}
      >
        {children}
        <SessionExpiryGuard />
        <Toaster />
      </body>
    </html>
  );
}
