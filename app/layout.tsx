import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Clipper Studio",
  description: "Ruang kerja pemotongan video untuk perangkat mobile.",
  applicationName: "Clipper Studio",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Clipper Studio" }
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fafcf9" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}