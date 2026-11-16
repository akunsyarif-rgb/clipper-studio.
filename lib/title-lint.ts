// Lint of a video title and its thumbnail text, judged as ONE pairing: a thumbnail that repeats the title wastes half the click
// surface, which is the most common packaging mistake. Pure and local, no AI. The result is advice shown next to the SEO pack; it
// never changes the pack's own score.
//
// The rules follow `title.py` of the "youtube-agent-skill" pack (MIT, (c) 2026 Jake Schincariol, see docs/THIRD_PARTY_NOTICES.md);
// the word lists are written again for Indonesian. Like every heuristic here, a flagged line is a reason to look again, not a verdict.

export type LintIssue = { id: string; message: string };
export type LintResult = {
  subject: string;
  /** 0-100: 100, minus 14 for every issue, plus 4 for everything that is fine. */
  score: number;
  issues: LintIssue[];
  good: string[];
};

/** YouTube cuts a title near 60 characters in desktop search and near 40 in a mobile feed. They fail differently: desktop loses the tail, mobile can lose the subject. */
export const TITLE_DESKTOP = 60, TITLE_MOBILE = 40, TITLE_HARD = 100;
/** Three words is the ceiling at feed size; a fourth is a grey smear. */
export const THUMB_MAX_WORDS = 3;

const VAGUE = new Set(["luar", "biasa", "gila", "dahsyat", "rahasia", "terbaik", "ultimate", "ajaib", "keren", "mantap", "wow", "fantastis", "spektakuler", "revolusioner", "menakjubkan", "epik", "sempurna", "super", "lengkap", "semua"]);
/** Words that carry no subject: a title whose first three words are all of these has not started yet. */
const STOP = new Set(["yang", "dan", "di", "ke", "dari", "untuk", "dengan", "ini", "itu", "cara", "apa", "kenapa", "mengapa", "bagaimana", "gimana", "aku", "saya", "kamu", "anda", "atau", "pada", "adalah", "akan", "ada", "juga", "para", "sebuah", "si", "jadi", "nah", "ya", "tips", "video"]);
/** Acronyms that are meant to be upper case; they are not shouting. */
const ACRONYMS = new Set(["SEO", "UMKM", "CEO", "FYP", "CTA", "IG", "AI", "USA", "NASA", "HP", "PC", "TV", "KTP", "NPWP", "BPJS", "OJK", "ATM", "ASN", "PNS", "THR", "CPNS"]);

const words = (t: string): string[] => t.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
const contentWords = (t: string): Set<string> => new Set(words(t).filter(w => !STOP.has(w)));
const score = (issues: number, good: number) => Math.max(0, Math.min(100, 100 - 14 * issues + 4 * good));

/** The title on its own, and paired with the thumbnail text when there is one. */
export function lintTitle(titleRaw: string, thumbRaw?: string): LintResult {
  const title = titleRaw.replace(/\s+/g, " ").trim();
  const n = [...title].length;
  const issues: LintIssue[] = [], good: string[] = [];
  if (n > TITLE_HARD) issues.push({ id: "panjang", message: `${n} karakter: batas YouTube ${TITLE_HARD}` });
  else if (n > TITLE_DESKTOP) issues.push({ id: "panjang", message: `${n} karakter: di pencarian desktop terpotong sekitar ${TITLE_DESKTOP}` });
  else good.push(`${n} karakter, masih di bawah batas potong desktop (${TITLE_DESKTOP})`);
  if (n > TITLE_MOBILE) {
    const head = title.slice(0, TITLE_MOBILE).replace(/\s+\S*$/, "");
    issues.push({ id: "ponsel", message: `di beranda ponsel yang tampil kira-kira “${head}…”: pastikan pokok judul masih terbaca` });
  }
  const caps = title.split(/\s+/).filter(w => w.length > 2 && w === w.toUpperCase() && /\p{Lu}/u.test(w) && !ACRONYMS.has(w.replace(/[^\p{L}]/gu, "")));
  if (caps.length > 2) issues.push({ id: "teriak", message: `${caps.length} kata huruf kapital semua: dua adalah batas sebelum judul terbaca seperti spam` });
  else if (caps.length) good.push(`${caps.length} kata kapital untuk penekanan`);
  const vague = [...new Set(words(title).filter(w => VAGUE.has(w)))];
  if (vague.length) issues.push({ id: "kosong", message: `${vague.join(", ")}: ganti dengan angka, nama, atau tanggal` });
  const nums = title.match(/\d[\d.,]*%?/g);
  const names = title.split(/\s+/).slice(1).filter(w => /^\p{Lu}\p{L}+/u.test(w) && w !== w.toUpperCase());
  if (nums) good.push(`memuat angka (${nums.slice(0, 3).join(", ")})`);
  else if (names.length) good.push(`memuat nama (${names.slice(0, 2).join(", ")})`);
  else issues.push({ id: "tanpa-angka", message: "tidak ada angka, tanggal, atau nama: perbaikan tunggal yang paling andal" });
  if (title.endsWith("?")) good.push("pertanyaan terbuka di judul");
  if (!words(title).slice(0, 3).some(w => !STOP.has(w))) issues.push({ id: "depan", message: "tiga kata pertama semuanya kata kosong: majukan pokok judulnya" });
  if (thumbRaw && thumbRaw.trim()) { issues.push(...thumbIssues(title, thumbRaw)); good.push(...thumbGood(title, thumbRaw)); }
  return { subject: title, score: score(issues.length, good.length), issues, good };
}

function thumbIssues(title: string, thumb: string): LintIssue[] {
  const out: LintIssue[] = [];
  const shared = [...contentWords(title)].filter(w => contentWords(thumb).has(w));
  if (shared.length) out.push({ id: "kembar", message: `thumbnail mengulang judul pada kata ${shared.join(", ")}: thumbnail sebaiknya mengatakan apa yang tidak dikatakan judul` });
  const nw = words(thumb).length;
  if (nw > THUMB_MAX_WORDS) out.push({ id: "thumb-panjang", message: `${nw} kata di thumbnail: tiga adalah batasnya di ukuran beranda` });
  return out;
}
function thumbGood(title: string, thumb: string): string[] {
  const out: string[] = [];
  if (!thumbIssues(title, thumb).some(i => i.id === "kembar")) out.push("thumbnail dan judul memakai kata yang berbeda");
  if (words(thumb).length <= THUMB_MAX_WORDS) out.push(`thumbnail ${words(thumb).length} kata (batas ${THUMB_MAX_WORDS})`);
  return out;
}

/** The thumbnail text alone, optionally against the line it sits next to (the on-screen hook of a short video). */
export function lintThumb(thumbRaw: string, against?: string): LintResult {
  const thumb = thumbRaw.replace(/\s+/g, " ").trim();
  const issues = against && against.trim() ? thumbIssues(against, thumb) : thumbIssues("", thumb);
  const good = against && against.trim() ? thumbGood(against, thumb) : (words(thumb).length <= THUMB_MAX_WORDS ? [`${words(thumb).length} kata (batas ${THUMB_MAX_WORDS})`] : []);
  return { subject: thumb, score: score(issues.length, good.length), issues, good };
}

/** Ranks several titles (all against the same thumbnail text), best first. */
export const rankTitles = (titles: string[], thumb?: string): LintResult[] => titles.map((t, i) => ({ r: lintTitle(t, thumb), i })).sort((a, b) => b.r.score - a.r.score || a.i - b.i).map(x => x.r);
