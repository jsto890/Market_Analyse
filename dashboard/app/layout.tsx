import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import ContextStrip from "@/components/ContextStrip";
import StatusDot from "@/components/StatusDot";
import CommandK from "@/components/CommandK";
import HelpOverlay from "@/components/HelpOverlay";
import TooltipProvider from "@/components/ui/TooltipProvider";

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
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <TooltipProvider>
          <Nav contextStrip={<ContextStrip />} statusDot={<StatusDot />} />
          <CommandK />
          <HelpOverlay />
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
