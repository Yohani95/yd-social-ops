import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "YD Social Ops — Bot de ventas con IA para redes sociales",
    template: "%s | YD Social Ops",
  },
  description:
    "Automatiza tus ventas en redes sociales con inteligencia artificial. Bot inteligente para WhatsApp, Instagram, Messenger y tu sitio web. Genera links de pago de Mercado Pago automáticamente.",
  keywords: [
    "bot de ventas",
    "automatización ventas",
    "redes sociales",
    "inteligencia artificial",
    "WhatsApp bot",
    "Instagram bot",
    "Mercado Pago",
    "chatbot IA",
    "ventas online Chile",
    "SaaS ventas",
  ],
  authors: [{ name: "YD Social Ops" }],
  creator: "YD Social Ops",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://ydsocialops.com"
  ),
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: "YD Social Ops",
    title: "YD Social Ops — Bot de ventas con IA para redes sociales",
    description:
      "Automatiza tus ventas con un bot inteligente que responde clientes, genera links de pago y descuenta stock. 24/7 en WhatsApp, Instagram y tu web.",
  },
  twitter: {
    card: "summary_large_image",
    title: "YD Social Ops — Bot de ventas con IA",
    description:
      "Automatiza tus ventas con un bot inteligente. WhatsApp, Instagram, Messenger y más. Mercado Pago integrado.",
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-icon.svg",
  },
};

import { CookieBanner } from "@/components/ui/cookie-banner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <CookieBanner />
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}

