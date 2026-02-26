import type { Metadata } from "next";
import { Space_Grotesk, Outfit } from "next/font/google";
import "./globals.css";
import { StarknetProvider } from "@/components/StarknetProvider";
import { ToastProvider } from "@/components/Toast";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "StarkFleet Clash - Privacy-Preserving Battleship on Starknet",
  description: "Trustless Battleship. Real fog of war. Zero trust required.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${outfit.variable}`}>
      <body className="antialiased min-h-screen relative">
        {/* Background Atmosphere */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-[-1]">
          <div className="mesh-orb-1"></div>
          <div className="mesh-orb-2"></div>
          <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay"></div>
        </div>

        <StarknetProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </StarknetProvider>
      </body>
    </html>
  );
}
