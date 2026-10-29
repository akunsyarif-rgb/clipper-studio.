// The clipper's work in progress (chosen video, cut list, settings) kept in memory while the app stays open, so going to the
// motion studio and back is not a fresh start. Memory, not IndexedDB: Safari on iPad can read a large video back from
// IndexedDB damaged (see lib/session-store.ts), and moving between pages is an in-app navigation, so the very same File survives.
// A reload or a new tab starts clean, by design.
import type { Aspect, Fit, Quality } from "./clip";
import type { Transcript } from "./transcript";

export type ClipperClip = { id: number; start: number; end: number; title?: string; transcript?: Transcript };
export type ClipperWork = {
  file: File;
  duration: number;
  start: string;
  end: string;
  aspect: Aspect;
  quality: Quality;
  fit: Fit;
  hook: string;
  transcript: string;
  clips: ClipperClip[];
};

let work: ClipperWork | null = null;

export const saveClipperWork = (w: ClipperWork) => { work = w; };
export const loadClipperWork = (): ClipperWork | null => (work && work.file instanceof File && work.file.size > 0 ? work : null);
export const clearClipperWork = () => { work = null; };
