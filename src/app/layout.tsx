import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Nav } from "@/components/layout/nav";

// Variable fonts cover the full weight ranges we use (Inter 400–800,
// JetBrains Mono 400–700), surfaced as the --font-sans / --font-mono vars.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FundDesk",
  description: "Funding desk for car dealership finance managers.",
};

// "8:14a" — Phoenix time, no padded hour, single-letter meridiem, lowercased.
function phoenixViewedAt(): string {
  const t = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date())
  return t.replace(/\s?AM$/, "a").replace(/\s?PM$/, "p").toLowerCase()
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} min-h-full flex flex-col bg-canvas text-fg-primary font-sans antialiased`}
      >
        <Nav />
        {children}
        <footer className="border-t border-line px-6 py-3 text-right font-mono text-xs tracking-wide text-fg-muted">
          funddesk v0.1 · viewed {phoenixViewedAt()} · phoenix
        </footer>
        <Toaster />
      </body>
    </html>
  );
}
