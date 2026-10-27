// Popular names (apps, platforms, shops) get their own icon, ahead of the generic concept icons: "YouTube" shows a
// play badge, not a "video" camera. The glyphs are simple line drawings made for this studio on the same 24-unit grid
// as the other icons; they hint at each service (they are not its official logo) and use no third-party artwork.
import { Car, Cloud, FileText, Gamepad2, Ghost, GitBranch, Mail, Palette, Pin, Podcast, QrCode, Scissors, ShoppingBag, Sparkles, Video, Wallet, type IconNode } from "lucide";
import { stripMarks, wordKey } from "./text";

export type Brand = { id: string; label: string; icon: IconNode; words: string[] };

const s = (attrs: Record<string, string>) => attrs;

export const BRANDS: Brand[] = [
  { id: "youtube", label: "YouTube", words: ["youtube", "yt", "youtuber", "youtubers", "youtube shorts"], icon: [["rect", s({ x: "2", y: "5", width: "20", height: "14", rx: "4" })], ["path", s({ d: "M10 9.2v5.6L15 12z" })]] },
  { id: "tiktok", label: "TikTok", words: ["tiktok", "tik tok", "fyp", "tiktoker"], icon: [["path", s({ d: "M14 3v10.5a3.5 3.5 0 1 1-3.5-3.5" })], ["path", s({ d: "M14 3c.4 2.4 2.1 4.1 5 4.4" })]] },
  { id: "instagram", label: "Instagram", words: ["instagram", "insta", "ig", "reel", "reels"], icon: [["rect", s({ x: "3", y: "3", width: "18", height: "18", rx: "5" })], ["circle", s({ cx: "12", cy: "12", r: "4" })], ["path", s({ d: "M17.5 6.5h.01" })]] },
  { id: "facebook", label: "Facebook", words: ["facebook", "fb"], icon: [["rect", s({ x: "3", y: "3", width: "18", height: "18", rx: "5" })], ["path", s({ d: "M15 21v-7h2.2l.4-2.6H15V9.8c0-.8.4-1.3 1.4-1.3H18V6.2C17.6 6.1 16.8 6 15.9 6 14 6 12.4 7.2 12.4 9.400v1.900H10.200V14h2.200v7" })]] },
  { id: "whatsapp", label: "WhatsApp", words: ["whatsapp", "whats app", "wa"], icon: [["path", s({ d: "M3 21l1.6-4.6A8.5 8.5 0 1 1 8 19.6z" })], ["path", s({ d: "M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-.8.8c-1-.4-1.9-1.3-2.3-2.3l.8-.8-1-2z" })]] },
  { id: "x", label: "X (Twitter)", words: ["twitter", "tweet", "tweets", "x.com"], icon: [["path", s({ d: "M4 4l16 16" })], ["path", s({ d: "M20 4L4 20" })]] },
  { id: "telegram", label: "Telegram", words: ["telegram"], icon: [["path", s({ d: "M21 3L3 10.5l6 2.2L11.2 20l3.2-4.6 4.8 3.5z" })], ["path", s({ d: "M9 12.700L21 3" })]] },
  { id: "linkedin", label: "LinkedIn", words: ["linkedin"], icon: [["rect", s({ x: "3", y: "3", width: "18", height: "18", rx: "3" })], ["path", s({ d: "M8 10.5V16" })], ["path", s({ d: "M8 7.5h.01" })], ["path", s({ d: "M12 16v-5.5" })], ["path", s({ d: "M12 12.5c0-1.5 1-2 2.2-2 1.4 0 2 .9 2 2.300V16" })]] },
  { id: "spotify", label: "Spotify", words: ["spotify"], icon: [["circle", s({ cx: "12", cy: "12", r: "9" })], ["path", s({ d: "M7 9.5c3.5-1 7-.7 10 1" })], ["path", s({ d: "M7.5 12.800c2.8-.8 5.6-.5 8 .9" })], ["path", s({ d: "M8 15.800c2.2-.6 4.3-.4 6.2.6" })]] },
  { id: "google", label: "Google", words: ["google", "googling", "googled"], icon: [["path", s({ d: "M18 6A8.5 8.5 0 1 0 20.5 12H12" })]] },
  { id: "netflix", label: "Netflix", words: ["netflix"], icon: [["path", s({ d: "M6 21V3l12 18V3" })]] },
  { id: "twitch", label: "Twitch", words: ["twitch"], icon: [["path", s({ d: "M4 3h17v11l-5 5h-4l-3 3v-3H4z" })], ["path", s({ d: "M12 8v4" })], ["path", s({ d: "M16.5 8v4" })]] },
  { id: "podcast", label: "Podcast", words: ["podcast", "podcasts", "podcaster"], icon: Podcast },
  { id: "marketplace", label: "Marketplace", words: ["shopee", "tokopedia", "lazada", "bukalapak", "amazon", "ebay", "blibli"], icon: ShoppingBag },
  { id: "ride", label: "Transportasi online", words: ["gojek", "gofood", "grabfood", "grabcar", "grabbike", "naik grab", "pesan grab", "driver grab", "ojek grab", "uber"], icon: Car },
  { id: "capcut", label: "CapCut", words: ["capcut", "cap cut"], icon: Scissors },
  { id: "canva", label: "Canva", words: ["canva"], icon: Palette },
  { id: "meeting", label: "Rapat online", words: ["zoom meeting", "zoom call", "google meet", "ms teams", "microsoft teams", "video call", "vidcall"], icon: Video },
  { id: "discord", label: "Discord", words: ["discord"], icon: Gamepad2 },
  { id: "pinterest", label: "Pinterest", words: ["pinterest"], icon: Pin },
  { id: "snapchat", label: "Snapchat", words: ["snapchat", "snap chat"], icon: Ghost },
  { id: "github", label: "GitHub", words: ["github", "gitlab"], icon: GitBranch },
  { id: "gmail", label: "Gmail", words: ["gmail"], icon: Mail },
  { id: "drive", label: "Cloud drive", words: ["google drive", "gdrive", "dropbox", "onedrive", "icloud"], icon: Cloud },
  { id: "office", label: "Dokumen kantor", words: ["excel", "powerpoint", "microsoft word", "ms word", "google docs", "google sheets"], icon: FileText },
  { id: "ewallet", label: "Dompet digital", words: ["gopay", "ovo", "shopeepay", "qris", "linkaja"], icon: QrCode },
  { id: "bank", label: "Perbankan digital", words: ["mbanking", "m-banking", "internet banking", "paypal", "wise"], icon: Wallet },
  { id: "games", label: "Game populer", words: ["pubg", "free fire", "roblox", "minecraft", "fortnite", "valorant", "genshin", "mobile legends"], icon: Gamepad2 },
  { id: "chatai", label: "Asisten AI", words: ["chatgpt", "chat gpt", "openai", "gemini", "copilot", "deepseek", "claude"], icon: Sparkles },
];

export type BrandMention = { id: string; /** Lower-cased word as it is spoken, to find it in the sentence. */ word: string; /** Position of that word among the words of the sentence. */ index: number };

/** A name matches a whole word; long, unmistakable names also match inside longer words ("youtubers"). */
function matches(token: string, word: string): boolean {
  return token === word || (word.length >= 6 && token.includes(word));
}

/**
 * Popular names in the sentence, in the order they are said (each at most once, at most three), with the word that
 * names them so an animation can appear when it is spoken.
 */
export function matchBrands(text: string): BrandMention[] {
  const tokens = stripMarks(text).split(/\s+/).filter(Boolean).map(wordKey);
  const found: BrandMention[] = [];
  // Every place a multi-word name occurs, whether or not it is the first mention of that name.
  const claims: { id: string; from: number; to: number }[] = [];
  for (const b of BRANDS) {
    let best: BrandMention | null = null;
    for (const w of b.words) {
      const parts = w.split(" ");
      for (let i = 0; i + parts.length <= tokens.length; i++) {
        if (!parts.every((p, k) => tokens[i + k] === p || (parts.length === 1 && matches(tokens[i], p)))) continue;
        if (parts.length > 1) claims.push({ id: b.id, from: i, to: i + parts.length });
        if (!best || i < best.index) best = { id: b.id, word: tokens[i], index: i };
        if (parts.length === 1) break;
      }
    }
    if (best) found.push(best);
  }
  // A phrase claims its words: "Google Drive" is the drive, not Google plus a drive.
  return found
    .filter(m => !claims.some(c => c.id !== m.id && m.index >= c.from && m.index < c.to))
    .sort((a, b) => a.index - b.index)
    .slice(0, 3);
}
