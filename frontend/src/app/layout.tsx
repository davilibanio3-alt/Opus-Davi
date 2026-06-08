import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Opus Davi · Bitcoin Mainnet Platform",
  description:
    "Institutional Bitcoin Mainnet platform — explorer, self-custody wallet, PSBT engine, authorized recovery, real Stratum mining client and pool dashboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
