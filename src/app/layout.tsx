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
        <Toaster />
      </body>
    </html>
  );
}
