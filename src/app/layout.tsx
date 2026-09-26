import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Courtside — Basketball Analytics",
  description: "Gestão de equipa, presenças, registo de jogos e análise de basquetebol.",
};

export const viewport: Viewport = { themeColor: "#0b0e13" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" className="h-full antialiased">
      <body className="min-h-full">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
