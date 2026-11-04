import type { Metadata } from "next";
import HubLibrary from "../HubLibrary";

export const metadata: Metadata = { title: "Library · Clipper Studio" };

export default function HubPage() {
  return <HubLibrary />;
}
