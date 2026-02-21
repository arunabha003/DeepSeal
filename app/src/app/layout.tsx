import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "DeepSeal",
  description: "DeepSeal RWA Due-Diligence Protocol",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Nav />
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {children}
            </main>
            <footer className="border-t border-surface-3 py-4 text-center text-xs text-muted">
              DeepSeal -- Chainlink CRE / ERC-8004 / ERC-4626 / x402
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
