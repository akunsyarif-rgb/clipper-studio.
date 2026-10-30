import type { Metadata } from "next";
import HubLibrary from "../HubLibrary";

export const metadata: Metadata = { title: "Content Hub · Clipper Studio" };

export default function HubPage() {
  return <HubLibrary />;
}
