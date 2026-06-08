import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import GKeySpotlight from "@/components/GKeySpotlight";

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
        <Nav />
        <GKeySpotlight />
        {children}
      </body>
    </html>
  );
}
