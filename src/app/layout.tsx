import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "./providers";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Infranex BT — Bittensor Subnet Intelligence Platform",
  description:
    "A single pane for every Bittensor subnet you track — scores, miners, profitability, and the workers that keep the picture current.",
  keywords: [
    "Bittensor",
    "subnet",
    "TAO",
    "decentralized AI",
    "machine learning",
    "blockchain",
    "analytics",
    "mining",
  ],
  authors: [{ name: "Infranex BT" }],
  icons: {
    // WINDUP-1: was an external CDN URL — serve the bundled logo instead.
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Infranex BT — Bittensor Subnet Intelligence Platform",
    description:
      "Advanced analytics and intelligence platform for Bittensor subnets.",
    type: "website",
  },
};

// Runs before first paint: restores the user's saved theme, defaulting to light.
const THEME_INIT = `try{if(localStorage.getItem("infranex-theme")==="dark"){document.documentElement.classList.add("dark")}}catch(e){}`;

// EXTENSION-GUARD-1 — some browser extensions (McAfee WebAdvisor, Free
// Download Manager, form-filler tools) stamp a random `fdprocessedid`
// attribute onto every <button>/<input> before React hydrates. React 19
// then reports a hydration attribute mismatch ("A tree hydrated but some
// attributes of the server rendered HTML didn't match…"). The attribute is
// harmless and React leaves it in place, but the console noise buries real
// errors — so strip it during the pre-hydration window. A short-lived
// MutationObserver catches late stamps; hydration only compares the DOM in
// its first moments, so disconnecting after 20s is safe.
const EXTENSION_GUARD = `try{(function(){
var a="fdprocessedid";
var s=function(){var e=document.querySelectorAll("["+a+"]");for(var i=0;i<e.length;i++)e[i].removeAttribute(a)};
s();
var o=new MutationObserver(s);
o.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:[a]});
setTimeout(function(){o.disconnect()},20000);
})()}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <script dangerouslySetInnerHTML={{ __html: EXTENSION_GUARD }} />
      </head>
      <body
        className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrains.variable} font-sans antialiased bg-background text-foreground min-h-screen`}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
