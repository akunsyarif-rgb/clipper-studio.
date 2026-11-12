import { useRef, useState } from "react";
import { type Transcript } from "@/lib/transcript";
import { type Density } from "@/lib/importance";
import type { OverlayPosition } from "@/lib/overlay";
import { type Edit, type EditProfile } from "@/lib/edit-profile";
import { type Trim } from "@/lib/trim";

export default function useSourceState() {
// Transcript handed over from the clipper: `offer` is waiting in sessionStorage, `imported` was applied to the script.
  const [offer, setOffer] = useState<{ source: string; transcript: Transcript } | null>(null);
  const [imported, setImported] = useState<Transcript | null>(null);
  // Source video for automatic transcript (uploaded right here); its own audio becomes the narration so captions match.
  const sourceVideo = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<{ file: File; url: string; seconds: number } | null>(null);
  const [sourceError, setSourceError] = useState("");
  const [asrBusy, setAsrBusy] = useState(false);
  // Edit mode: the uploaded video is the base layer (with its own audio); scenes become captions or cutaway graphics.
  const [videoEdit, setVideoEdit] = useState(false);
  // The part of the source video that is used (null = all of it) and the range a Clipper clip came with.
  const [trim, setTrim] = useState<Trim | null>(null);
  const [trimNote, setTrimNote] = useState("");
  // Editing profile over a source video (music / comedy): reviewable picture-only edits and the punchlines' caption emphasis, in file time.
  const [editProfile, setEditProfile] = useState<EditProfile>("standard");
  const [edits, setEdits] = useState<Edit[]>([]);
  const [emphasis, setEmphasis] = useState<{ from: number; to: number }[]>([]);
  const [comedySfx, setComedySfx] = useState(false);
  const [captionOffset, setCaptionOffset] = useState(0);
  // Where animations drawn over the speaker sit: the empty space above the head, or just above the captions.
  const [overlayPos, setOverlayPos] = useState<OverlayPosition>("top");
  // How many scenes get an animation, and how elaborate a popular name's animation is.
  const [density, setDensity] = useState<Density>("balanced");
  return { asrBusy, captionOffset, comedySfx, density, editProfile, edits, emphasis, imported, offer, overlayPos, setAsrBusy, setCaptionOffset, setComedySfx, setDensity, setEditProfile, setEdits, setEmphasis, setImported, setOffer, setOverlayPos, setSource, setSourceError, setTrim, setTrimNote, setVideoEdit, source, sourceError, sourceVideo, trim, trimNote, videoEdit };
}
