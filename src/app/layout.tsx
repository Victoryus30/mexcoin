import type { Metadata } from "next";
import { MiniKitProvider } from "@worldcoin/minikit-js/minikit-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "MexCoin — MXC",
  description: "Reclama y compra MexCoin, el token mexicano premium en World Chain",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <MiniKitProvider>
        <body>{children}</body>
      </MiniKitProvider>
    </html>
  );
}
