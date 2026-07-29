import type { Metadata } from "next";
import { Fira_Sans, Fira_Code } from "next/font/google";
import "./globals.css";

// Data-dashboard pairing (self-hosted at build time — no runtime external fetch).
const firaSans = Fira_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});
import Nav from "@/components/Nav";
import ContextStrip from "@/components/ContextStrip";
import CommandK from "@/components/CommandK";
import HelpOverlay from "@/components/HelpOverlay";
import TooltipProvider from "@/components/ui/TooltipProvider";
import UndoToastProvider from "@/components/ui/UndoToastProvider";
import RailShell from "@/components/rails/RailShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Argus Dashboard",
  description: "Trading signal dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${firaSans.variable} ${firaCode.variable}`}>
      <body className="font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-elevated focus:border focus:border-line focus:px-3 focus:py-1.5 focus:text-[13px] focus:text-foreground"
        >
          Skip to content
        </a>
        <TooltipProvider>
          <UndoToastProvider>
            <Nav contextStrip={<ContextStrip />} />
            <CommandK />
            <HelpOverlay />
            <RailShell>{children}</RailShell>
          </UndoToastProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
