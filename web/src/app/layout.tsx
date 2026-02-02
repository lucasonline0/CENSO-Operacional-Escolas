import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SplashScreen } from "@/components/ui/splash-screen";
import { AutoFiller } from "@/dev/auto-filler";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={inter.className}>
        <SplashScreen />
        {children}
        <AutoFiller />
      </body>
    </html>
  );
}