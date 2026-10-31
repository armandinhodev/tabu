import type { Metadata } from "next";
import localFont from "next/font/local";

import "./globals.css";

// Las fuentes viven en el repositorio: el build nunca depende de la red.
// Cada familia es un archivo variable, así que un solo archivo cubre sus pesos.
const outfit = localFont({
  src: "./fonts/outfit.woff2",
  weight: "100 900",
  variable: "--font-outfit",
  display: "swap",
});

const inter = localFont({
  src: "./fonts/inter.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

const jetBrainsMono = localFont({
  src: "./fonts/jetbrains-mono.woff2",
  weight: "100 900",
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tabú",
  description: "Juego de Tabú multijugador en tiempo real para grupos de amigos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${outfit.variable} ${inter.variable} ${jetBrainsMono.variable}`}>
      <body className="min-h-dvh bg-canvas font-sans text-fg antialiased">{children}</body>
    </html>
  );
}
