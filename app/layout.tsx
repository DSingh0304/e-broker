import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { SiteNav } from "@/components/layout/SiteNav";
import { SiteFooter } from "@/components/layout/SiteFooter";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "E-Broker - Turn E-Waste Into Value",
  description: "Photograph. Identify. Price. Recycle.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-pcb-green font-sans text-pcb-gold antialiased">
        <Providers>
          <a
            href="#content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-pcb-accent focus:px-4 focus:py-2 focus:font-bold focus:text-black"
          >
            Skip to content
          </a>
          <SiteNav />
          <main id="content" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
