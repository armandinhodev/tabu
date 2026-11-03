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

/**
 * La URL pública del sitio. Sin ella la vista previa al compartir se arma con
 * `localhost`; en producción conviene definir `PUBLIC_SITE_URL`.
 */
const SITE_URL = process.env.PUBLIC_SITE_URL ?? "http://localhost:3000";

const DESCRIPTION =
  "Juego de Tabú multijugador en tiempo real para grupos de amigos: sin registro y sin instalar nada.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Tabú — juego de fiesta en tiempo real",
    template: "%s · Tabú",
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Tabú",
    title: "Tabú — juego de fiesta en tiempo real",
    description: DESCRIPTION,
    images: [
      {
        url: "/og-game.jpg",
        width: 1200,
        height: 630,
        alt: "Una partida de Tabú en curso: la palabra, sus prohibidas y el reloj del turno",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tabú — juego de fiesta en tiempo real",
    description: DESCRIPTION,
    images: ["/og-game.jpg"],
  },
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
