import { useEffect, useState } from "react";
import { type SeoSeed } from "../../SeoPanel";
import { type AffiliateBrief } from "@/lib/affiliate";
import { MODE_KEY } from "../_components/constants";
import type { Mode } from "../_components/types";

export default function usePanelState() {
// Set while the affiliate panel holds a complete product brief: this is then a selling video.
  const [affiliateBrief, setAffiliateBrief] = useState<AffiliateBrief | null>(null);
  // Which kind of content this is: ordinary, or a selling (affiliate) video. The last choice is remembered on this device.
  const [contentMode, setContentMode] = useState<Mode>("normal");
  const [seoSeed, setSeoSeed] = useState<SeoSeed | null>(null);
  useEffect(() => { try { if (localStorage.getItem(MODE_KEY) === "affiliate") setContentMode("affiliate"); } catch { /* storage blocked: starts as ordinary content */ } }, []);
  function chooseMode(m: Mode) { setContentMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* not remembered */ } }
  const [directorNote, setDirectorNote] = useState("");
  const [guide, setGuide] = useState(false);
  return { affiliateBrief, chooseMode, contentMode, directorNote, guide, seoSeed, setAffiliateBrief, setDirectorNote, setGuide, setSeoSeed };
}
