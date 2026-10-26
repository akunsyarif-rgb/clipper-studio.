import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
export const metadata: Metadata = {
  title: "Clipper Studio",
  description: "Ruang kerja pemotongan video untuk perangkat mobile.",
  applicationName: "Clipper Studio",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Clipper Studio" }
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fafcf9" };

// Safari has no native Symbol.dispose yet. mediabunny, @remotion/web-renderer and esbuild's `using` helper
// each polyfill it with a different key, so which one wins depends on chunk load order and rendering fails
// with "Object not disposable". Define it once, before any bundle runs, with the key the helper expects.
const SYMBOL_DISPOSE_POLYFILL = `(function(){for(var n of["dispose","asyncDispose"])if(typeof Symbol[n]!=="symbol")Object.defineProperty(Symbol,n,{value:Symbol.for("Symbol."+n)})})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>
    <Script id="symbol-dispose-polyfill" strategy="beforeInteractive">{SYMBOL_DISPOSE_POLYFILL}</Script>
    {children}
  </body></html>;
}
