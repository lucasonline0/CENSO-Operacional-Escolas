import type { Metadata } from "next";
import "./globals.css";
import { SplashScreen } from "@/components/ui/splash-screen";

export const metadata: Metadata = {
  title: "Censo Escolar 2026",
  description: "Sistema de Levantamento Estrutural e Operacional - SEDUC/PA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <SplashScreen />
        {children}
      </body>
    </html>
  );
}
