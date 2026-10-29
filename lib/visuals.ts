// Picks a visual for each scene from its text (Indonesian + English): a layout template, a line icon
// (Lucide, ISC licence) and words to emphasise. Pure and deterministic; used by the UI, the Remotion
// composition and unit tests. Users can override template and icon per scene.
import {
  Anchor, ArrowRight, Baby, BatteryLow, Bell, BookOpen, Bookmark, Brain, Briefcase, Building, CalendarDays, Camera, Car, ChartColumn,
  CircleCheck, CircleQuestionMark, CircleX, Clock, Code, Coffee, Coins, Compass, Cpu, Crown, Droplets, Dumbbell, Ear, EighthNotes, Eye,
  FaceSlightlyFrowning, FaceSlightlySmiling, Flag, Flame, Footprints, Gamepad2, Gem, Gift, Globe, GraduationCap, Hand, Handshake, Heart,
  HeartPulse, Hourglass, House, Infinity as InfinityIcon, KeyRound, Leaf, Lightbulb, ListChecks, Lock, Mail, MapPin, Megaphone, MessageCircle, Mic, Moon,
  Mountain, MousePointerClick, Palette, PenLine, Pill, Plane, Puzzle, Quote, RefreshCw, Repeat, Rocket, Scale, Search, Settings, Share2,
  ShieldCheck, ShoppingCart, Smartphone, Sparkles, Sprout, Star, Stethoscope, Sun, Tag, Target, TrendingDown, TrendingUp, TriangleAlert,
  ThumbsUp, Trophy, Truck, Umbrella, Users, Utensils, Video, Wallet, Wrench, Zap, type IconNode,
} from "lucide";
import { BRANDS, matchBrands, type BrandMention } from "./brands";
import { ambiguousMask, isCallToAction, WEAK_WORDS } from "./sense";

export type Template = "statement" | "list" | "question" | "number" | "compare" | "cta" | "quote";

export const TEMPLATES: { id: Template; label: string }[] = [
  { id: "statement", label: "Ikon" },
  { id: "list", label: "Langkah" },
  { id: "question", label: "Tanya" },
  { id: "number", label: "Angka" },
  { id: "compare", label: "✗/✓" },
  { id: "cta", label: "Ajakan" },
  { id: "quote", label: "Kutipan" },
];

/** `soft` words count half: a content word elsewhere in the sentence ("coffee" in "do you like coffee") wins over them. */
type Concept = { id: string; label: string; icon: IconNode; words: string[]; weight?: number; soft?: string[] };

/**
 * Concepts with Indonesian and English keywords. Keywords of 4+ letters also match inside longer words
 * (Indonesian affixes: "mulai" → "memulai", "dimulai"; English inflections: "grow" → "growing").
 */
export const CONCEPTS: Concept[] = [
  { id: "wait", label: "Jam pasir (menunggu)", icon: Hourglass, words: ["tunggu", "sabar", "kesabaran", "menunda", "tunda", "wait", "patience", "patient", "delay", "procrastinat"] },
  { id: "time", label: "Jam (waktu)", icon: Clock, words: ["waktu", "jam", "menit", "detik", "terlambat", "deadline", "time", "hour", "minute", "late", "clock"] },
  { id: "calendar", label: "Kalender", icon: CalendarDays, words: ["hari", "minggu", "bulan", "tahun", "jadwal", "besok", "kemarin", "tanggal", "day", "week", "month", "year", "schedule", "tomorrow", "today", "date"] },
  { id: "habit", label: "Ulang (kebiasaan)", icon: Repeat, words: ["kebiasaan", "rutin", "rutinitas", "ulangi", "setiap hari", "habit", "routine", "repeat", "daily", "every day"] },
  { id: "forever", label: "Tak terbatas", icon: InfinityIcon, words: ["selalu", "selamanya", "konsisten", "terus", "always", "forever", "consistent", "consistency", "never stop"] },
  { id: "money", label: "Koin (uang)", icon: Coins, words: ["uang", "rupiah", "biaya", "harga", "gaji", "penghasilan", "cuan", "money", "cash", "cost", "price", "salary", "income", "earn", "profit"] },
  { id: "wallet", label: "Dompet (tabungan)", icon: Wallet, words: ["save money", "save up", "save cash", "hemat uang", "dompet", "tabung", "tabungan", "hemat", "investasi", "wallet", "saving", "budget", "invest"] },
  { id: "growth", label: "Grafik naik", icon: TrendingUp, words: ["tumbuh", "naik", "meningkat", "berkembang", "pertumbuhan", "progres", "kemajuan", "growth", "grow", "increase", "rise", "improve", "progress"] },
  { id: "decline", label: "Grafik turun", icon: TrendingDown, words: ["turun", "menurun", "rugi", "merosot", "decline", "decrease", "drop", "loss", "lose", "worse"] },
  { id: "data", label: "Diagram (data)", icon: ChartColumn, words: ["data", "statistik", "analisis", "laporan", "riset", "penelitian", "statistic", "analytics", "analysis", "report", "research", "survey"] },
  { id: "idea", label: "Lampu (ide)", icon: Lightbulb, words: ["ide", "gagasan", "kreatif", "kreativitas", "inspirasi", "idea", "creative", "creativity", "inspiration", "insight", "tip", "tips"] },
  { id: "target", label: "Target", icon: Target, words: ["target", "tujuan", "sasaran", "fokus", "goal", "focus", "aim", "purpose"] },
  { id: "start", label: "Roket (mulai)", icon: Rocket, words: ["mulai", "luncur", "awali", "aksi", "tindakan", "start", "launch", "begin", "boost", "action"] },
  { id: "step", label: "Jejak langkah", icon: Footprints, words: ["langkah", "jalan", "berjalan", "maju", "step", "walk", "forward", "move"] },
  { id: "small", label: "Tunas (awal kecil)", icon: Sprout, words: ["kecil", "pemula", "bibit", "tunas", "small", "tiny", "beginner", "seed"] },
  { id: "finish", label: "Bendera (selesai)", icon: Flag, words: ["selesai", "garis akhir", "pencapaian", "finish", "milestone", "complete"] },
  { id: "challenge", label: "Gunung (tantangan)", icon: Mountain, words: ["tantangan", "sulit", "rintangan", "hambatan", "challenge", "obstacle", "difficult", "hard", "struggle"] },
  { id: "success", label: "Piala (sukses)", icon: Trophy, words: ["menang", "juara", "sukses", "berhasil", "prestasi", "keberhasilan", "win", "winner", "champion", "success", "achieve"] },
  { id: "best", label: "Bintang", icon: Star, words: ["terbaik", "bintang", "unggul", "kualitas", "favorit", "best", "star", "quality", "excellent", "favorite"] },
  { id: "energy", label: "Petir (energi)", icon: Zap, words: ["semangat", "energi", "motivasi", "kuat", "cepat", "energy", "motivation", "motivated", "power", "fast", "quick"] },
  { id: "fire", label: "Api", icon: Flame, words: ["api", "panas", "viral", "membara", "fire", "hot", "burn", "passion"] },
  { id: "discipline", label: "Perisai (disiplin)", icon: ShieldCheck, words: ["disiplin", "aman", "keamanan", "lindungi", "perlindungan", "discipline", "safe", "security", "protect"] },
  { id: "lock", label: "Gembok", icon: Lock, words: ["rahasia", "privasi", "password", "sandi", "secret", "privacy", "lock"] },
  { id: "key", label: "Kunci", icon: KeyRound, words: ["kunci", "key"] },
  { id: "heart", label: "Hati", icon: Heart, words: ["cinta", "sayang", "peduli", "kasih", "love", "care", "kind"] },
  { id: "health", label: "Detak jantung (sehat)", icon: HeartPulse, words: ["sehat", "kesehatan", "jantung", "health", "healthy", "heart rate"] },
  { id: "exercise", label: "Dumbel (olahraga)", icon: Dumbbell, words: ["olahraga", "latihan", "gym", "otot", "exercise", "workout", "training", "muscle", "fitness"] },
  { id: "sleep", label: "Bulan (tidur)", icon: Moon, words: ["selamat malam", "good night", "tidur", "malam", "istirahat", "sleep", "night", "rest"] },
  { id: "morning", label: "Matahari (pagi)", icon: Sun, words: ["selamat pagi", "good morning", "good afternoon", "selamat siang", "pagi", "matahari", "siang", "morning", "sunrise", "sun"] },
  { id: "food", label: "Alat makan", icon: Utensils, words: ["makan", "makanan", "sarapan", "masak", "resep", "food", "eat", "meal", "breakfast", "cook", "recipe"] },
  { id: "water", label: "Tetes air", icon: Droplets, words: ["minum", "hidrasi", "drink", "water", "hydrat"] },
  { id: "coffee", label: "Kopi (santai)", icon: Coffee, words: ["kopi", "santai", "rehat", "coffee", "relax", "break"] },
  { id: "tired", label: "Baterai lemah", icon: BatteryLow, words: ["lelah", "capek", "burnout", "tired", "exhausted", "drained"] },
  { id: "book", label: "Buku (belajar)", icon: BookOpen, words: ["buku", "baca", "membaca", "belajar", "pelajari", "book", "read", "learn", "study"] },
  { id: "school", label: "Toga (pendidikan)", icon: GraduationCap, words: ["sekolah", "kuliah", "pendidikan", "ilmu", "siswa", "mahasiswa", "guru", "school", "education", "student", "teacher", "knowledge", "college"] },
  { id: "brain", label: "Otak (pikiran)", icon: Brain, words: ["otak", "pikir", "pikiran", "mental", "ingat", "fokuskan", "brain", "think", "mind", "memory", "remember", "mindset"] },
  { id: "write", label: "Pena (menulis)", icon: PenLine, words: ["tulis", "menulis", "catat", "jurnal", "write", "note", "journal"] },
  { id: "talk", label: "Balon chat", icon: MessageCircle, words: ["bicara", "komunikasi", "pesan", "ngobrol", "obrolan", "talk", "speak", "message", "conversation", "communicat", "chat"] },
  { id: "people", label: "Orang (tim)", icon: Users, words: ["orang", "teman", "tim", "keluarga", "komunitas", "penonton", "pelanggan", "people", "friend", "team", "family", "community", "audience", "customer", "viewers"] },
  { id: "together", label: "Jabat tangan", icon: Handshake, words: ["kerjasama", "kolaborasi", "kesepakatan", "mitra", "partner", "collaborat", "agreement", "together"] },
  { id: "help", label: "Tangan (bantuan)", icon: Hand, words: ["bantu", "membantu", "tolong", "dukung", "dukungan", "help", "support", "assist"] },
  { id: "leader", label: "Mahkota", icon: Crown, words: ["pemimpin", "kepemimpinan", "raja", "bos", "leader", "leadership", "king", "boss"] },
  { id: "value", label: "Permata (berharga)", icon: Gem, words: ["berharga", "nilai", "bernilai", "mewah", "valuable", "value", "precious", "premium"] },
  { id: "calm", label: "Jangkar (stabil)", icon: Anchor, words: ["stabil", "tenang", "kokoh", "stable", "calm", "steady", "grounded"] },
  { id: "balance", label: "Timbangan", icon: Scale, words: ["adil", "seimbang", "keseimbangan", "hukum", "balance", "fair", "justice", "law"] },
  { id: "happy", label: "Wajah senang", icon: FaceSlightlySmiling, words: ["senang", "bahagia", "gembira", "tersenyum", "senyum", "happy", "smile", "joy", "fun"] },
  { id: "sad", label: "Wajah sedih", icon: FaceSlightlyFrowning, words: ["sedih", "kecewa", "stres", "cemas", "khawatir", "takut", "sad", "stress", "anxious", "worry", "afraid", "fear"] },
  { id: "warning", label: "Segitiga peringatan", icon: TriangleAlert, words: ["awas", "bahaya", "peringatan", "hati-hati", "risiko", "warning", "danger", "risk", "careful"] },
  { id: "wrong", label: "Silang (salah)", icon: CircleX, words: ["salah", "gagal", "hindari", "kesalahan", "wrong", "fail", "avoid", "mistake"] },
  { id: "dont", label: "Silang (jangan)", icon: CircleX, words: ["jangan", "don't", "dont", "never", "stop"], weight: 0.4 },
  { id: "right", label: "Centang (benar)", icon: CircleCheck, words: ["benar", "betul", "tepat", "correct", "done"] },
  { id: "problem", label: "Tanda tanya", icon: CircleQuestionMark, words: ["masalah", "kenapa", "mengapa", "bagaimana", "pertanyaan", "tanya", "problem", "why", "how", "question", "ask"], weight: 0.6 },
  { id: "solution", label: "Puzzle (solusi)", icon: Puzzle, words: ["solusi", "jawaban", "pecahkan", "solution", "solve", "answer"] },
  { id: "fix", label: "Kunci pas", icon: Wrench, words: ["perbaiki", "alat", "fix", "tool", "repair"] },
  { id: "system", label: "Gerigi (proses)", icon: Settings, words: ["sistem", "proses", "pengaturan", "atur", "strategi", "system", "process", "setting", "setup", "strategy"] },
  { id: "change", label: "Panah putar (ubah)", icon: RefreshCw, words: ["ubah", "berubah", "perubahan", "ganti", "transformasi", "change", "transform", "switch"] },
  { id: "list", label: "Daftar centang", icon: ListChecks, words: ["daftar", "cara", "checklist", "list", "ways"] },
  { id: "phone", label: "Ponsel", icon: Smartphone, words: ["ponsel", "handphone", "aplikasi", "app", "phone", "mobile", "smartphone"] },
  { id: "camera", label: "Kamera", icon: Camera, words: ["foto", "kamera", "gambar", "photo", "camera", "picture"] },
  { id: "video", label: "Video", icon: Video, words: ["video", "konten", "rekam", "film", "content", "record", "youtube", "tiktok", "reels"] },
  { id: "music", label: "Not musik", icon: EighthNotes, words: ["musik", "lagu", "music", "song"] },
  { id: "voice", label: "Mikrofon", icon: Mic, words: ["suara", "podcast", "mikrofon", "voice", "microphone"] },
  { id: "world", label: "Globe", icon: Globe, words: ["dunia", "global", "internet", "online", "website", "world"] },
  { id: "search", label: "Kaca pembesar", icon: Search, words: ["cari", "mencari", "temukan", "telusuri", "search", "find", "discover", "explore"] },
  { id: "ai", label: "Cip (teknologi/AI)", icon: Cpu, words: ["ai", "teknologi", "robot", "komputer", "otomatis", "technology", "computer", "automat"] },
  { id: "code", label: "Kode", icon: Code, words: ["kode", "coding", "program", "pemrograman", "code", "programming", "developer"] },
  { id: "see", label: "Mata", icon: Eye, words: ["lihat", "melihat", "perhatikan", "tonton", "perhatian", "see", "look", "watch", "view", "attention"] },
  { id: "listen", label: "Telinga", icon: Ear, words: ["dengar", "mendengar", "dengarkan", "listen", "hear"] },
  { id: "gift", label: "Kado (gratis)", icon: Gift, words: ["hadiah", "gratis", "bonus", "kado", "gift", "free", "reward"] },
  { id: "shop", label: "Keranjang belanja", icon: ShoppingCart, words: ["beli", "belanja", "jual", "toko", "produk", "pesanan", "buy", "shop", "sell", "store", "product", "order"] },
  { id: "sale", label: "Label harga (diskon)", icon: Tag, words: ["diskon", "promo", "murah", "potongan", "sale", "discount", "deal", "cheap"] },
  { id: "delivery", label: "Truk (kirim)", icon: Truck, words: ["kirim", "pengiriman", "ongkir", "delivery", "shipping", "ship"] },
  { id: "marketing", label: "Megafon", icon: Megaphone, words: ["iklan", "umumkan", "pengumuman", "pemasaran", "marketing", "announce", "advert", "ads"] },
  { id: "mail", label: "Surat", icon: Mail, words: ["email", "surat", "mail", "newsletter"] },
  { id: "work", label: "Tas kerja", icon: Briefcase, words: ["kerja", "bekerja", "pekerjaan", "karier", "kantor", "bisnis", "usaha", "work", "job", "career", "office", "business"] },
  { id: "company", label: "Gedung", icon: Building, words: ["perusahaan", "kota", "gedung", "company", "city", "building"] },
  { id: "home", label: "Rumah", icon: House, words: ["rumah", "home", "house"] },
  { id: "travel", label: "Pesawat", icon: Plane, words: ["liburan", "perjalanan", "wisata", "travel", "trip", "vacation", "holiday"] },
  { id: "car", label: "Mobil", icon: Car, words: ["mobil", "kendaraan", "car", "drive"] },
  { id: "place", label: "Pin lokasi", icon: MapPin, words: ["lokasi", "tempat", "alamat", "location", "place", "address"] },
  { id: "direction", label: "Kompas (arah)", icon: Compass, words: ["arah", "panduan", "petunjuk", "direction", "guide"] },
  { id: "nature", label: "Daun (alam)", icon: Leaf, words: ["alam", "lingkungan", "hijau", "tanaman", "nature", "environment", "green", "plant"] },
  { id: "rain", label: "Payung", icon: Umbrella, words: ["hujan", "asuransi", "rain", "insurance"] },
  { id: "kids", label: "Bayi (anak)", icon: Baby, words: ["anak", "bayi", "child", "kids", "baby"] },
  { id: "medicine", label: "Pil (obat)", icon: Pill, words: ["obat", "medicine", "pill"] },
  { id: "doctor", label: "Stetoskop", icon: Stethoscope, words: ["dokter", "rumah sakit", "doctor", "hospital"] },
  { id: "game", label: "Stik game", icon: Gamepad2, words: ["game", "bermain", "main", "play", "gaming"] },
  { id: "design", label: "Palet (desain)", icon: Palette, words: ["desain", "warna", "seni", "design", "color", "art"] },
  { id: "notify", label: "Lonceng", icon: Bell, words: ["notifikasi", "pengingat", "ingatkan", "notification", "reminder", "remind"] },
  { id: "share", label: "Bagikan", icon: Share2, words: ["bagikan", "sebarkan", "share"] },
  { id: "save", label: "Penanda (simpan)", icon: Bookmark, words: ["simpan", "save", "bookmark"] },
  { id: "like", label: "Jempol", icon: ThumbsUp, words: ["suka", "setuju", "bagus", "like", "agree", "good job", "great job", "well done", "nice work", "good work", "kerja bagus", "bagus sekali"], soft: ["like", "suka", "agree", "setuju"] },
  { id: "new", label: "Kilau (baru)", icon: Sparkles, words: ["baru", "keren", "ajaib", "menakjubkan", "new", "amazing", "magic", "wow"] },
  { id: "next", label: "Panah kanan", icon: ArrowRight, words: ["lanjut", "berikutnya", "selanjutnya", "next", "continue"] },
];

export const ICONS: Record<string, { label: string; icon: IconNode }> = Object.fromEntries([
  ...CONCEPTS.map(c => [c.id, { label: c.label, icon: c.icon }] as const),
  ...BRANDS.map(b => [b.id, { label: b.label, icon: b.icon }] as const),
  ["question", { label: "Tanda tanya", icon: CircleQuestionMark }],
  ["cta", { label: "Kursor klik", icon: MousePointerClick }],
  ["quote", { label: "Tanda kutip", icon: Quote }],
]);

/** `year`: a plain four-digit year such as 1945, shown without a thousands separator and without counting up. */
export type NumberInfo = { value: number; decimals: number; prefix: string; suffix: string; label: string; raw: string; year: boolean };
export type CompareInfo = { bad: string; good: string; neutral: boolean };

export type SceneVisual = {
  template: Template;
  /** Key into ICONS, or null for none. */
  icon: string | null;
  /** Lower-cased words to emphasise (accent colour + underline). */
  emphasis: string[];
  listIndex?: number | null;
  listLabel?: string;
  number?: NumberInfo;
  compare?: CompareInfo;
  cta?: string;
  /** Popular names found in the sentence (YouTube, TikTok, …) in the order they are said; they come before generic icons. */
  brands?: BrandMention[];
  /** The creator picked the icon by hand; quiet layouts that normally omit icons still show it. */
  iconPinned?: boolean;
};

export type VisualOverride = { template?: Template; icon?: string | "none" };

export { stripMarks, wordKey } from "./text";
import { stripMarks, wordKey } from "./text";

/** Endings allowed after a 4-letter keyword ("main" → "mainkan", "play" → "playing", but not "idea" → "ideal"). */
const SUFFIX = /^(|s|es|ed|d|ing|er|ers|ly|kan|an|i|nya|lah|kah|mu|ku)$/;
const ID_PREFIXES = ["meng", "meny", "mem", "men", "me", "ber", "be", "di", "ter", "per", "peng", "peny", "pem", "pen", "pe", "ke", "se"];

/**
 * The word as it may have looked without an Indonesian prefix: every prefix that fits is tried, and the first letter
 * that the prefix swallowed ("menulis" → "tulis", "membaca" → "baca", "memulai" → "mulai") is put back.
 */
function stems(token: string): string[] {
  const out = [token];
  for (const p of ID_PREFIXES) {
    if (!token.startsWith(p) || token.length - p.length < 3) continue;
    const rest = token.slice(p.length);
    out.push(rest);
    if (/^(meng|meny|mem|men|peng|peny|pem|pen)$/.test(p)) for (const c of "kstp") out.push(c + rest);
  }
  return out;
}

function wordMatches(token: string, keyword: string): boolean {
  if (keyword.includes(" ")) return false;
  if (token === keyword) return true;
  // Up to 3 letters: whole words only ("ai", "ide", "jam"). 4 letters: start of the word or after an
  // Indonesian prefix ("main" → "bermain", not "remain"). 5+: also at the start or after a prefix, with anything
  // after it ("mulai" → "memulai", "dimulai", "mulailah"), but not in the middle ("tanya" is not in "ceritanya").
  if (keyword.length <= 3) return false;
  if (keyword.length === 4) return token.split("-").some(part => stems(part).some(t => t.startsWith(keyword) && SUFFIX.test(t.slice(keyword.length))));
  // Parts of a hyphenated word count on their own ("uang-uang").
  return token.split("-").some(part => stems(part).some(t => t.startsWith(keyword)));
}

type ConceptHit = { id: string; words: string[]; score: number; pos: number };

function scoreConcepts(text: string, topics?: ReadonlySet<string>): ConceptHit[] {
  const plain = stripMarks(text);
  const tokens = plain.split(/\s+/).map(wordKey).filter(Boolean);
  const masked = ambiguousMask(tokens);
  const lower = " " + tokens.join(" ") + " ";
  const hits: ConceptHit[] = [];
  for (const c of CONCEPTS) {
    let score = 0, pos = Infinity, weakScore = 0, weakPos = Infinity;
    const words: string[] = [], weakWords: string[] = [];
    for (const k of c.words) {
      if (k.includes(" ")) {
        const i = lower.indexOf(" " + k + " ");
        if (i >= 0) { score += 1.5; pos = Math.min(pos, i); words.push(...k.split(" ")); }
        continue;
      }
      tokens.forEach((t, i) => {
        if (masked.has(i) || !wordMatches(t, k)) return;
        if (WEAK_WORDS.has(k)) { weakScore += 1; weakPos = Math.min(weakPos, i * 10); weakWords.push(t); }
        else { score += c.soft?.includes(k) ? 0.5 : 1; pos = Math.min(pos, i * 10); words.push(t); }
      });
    }
    // Generic words stand on their own only when the surrounding script is about the same thing.
    if (weakScore > 0 && topics?.has(c.id)) { score += weakScore; pos = Math.min(pos, weakPos); words.push(...weakWords); }
    score *= c.weight ?? 1;
    if (score > 0) hits.push({ id: c.id, words: [...new Set(words)], score, pos });
  }
  return hits.sort((a, b) => b.score - a.score || a.pos - b.pos);
}

/**
 * Best matching concept for the text, with the words that triggered it.
 * `topics` are the concepts the neighbouring scenes are about: a generic word ("move", "see", "day") counts only when
 * its concept is one of them, and a word used in another sense ("looks like", "so, like,") never counts.
 */
export function matchConcept(text: string, topics?: ReadonlySet<string>): { id: string; words: string[] } | null {
  const best = scoreConcepts(text, topics)[0];
  return best ? { id: best.id, words: best.words } : null;
}

/** Every concept the text is about, strongest first (a sentence that lists "uang, energi dan waktu" names three). */
export function matchConcepts(text: string, topics?: ReadonlySet<string>): string[] {
  return scoreConcepts(text, topics).map(h => h.id);
}

const ORDINALS: [RegExp, number | null, string][] = [
  [/^(pertama|first|firstly)\b/i, 1, ""], [/^(kedua|second|secondly)\b/i, 2, ""], [/^(ketiga|third|thirdly)\b/i, 3, ""],
  [/^(keempat|fourth)\b/i, 4, ""], [/^(kelima|fifth)\b/i, 5, ""], [/^(keenam|sixth)\b/i, 6, ""], [/^(ketujuh|seventh)\b/i, 7, ""],
  [/^(terakhir|finally|lastly)\b/i, null, ""],
];
const NUMBER_WORDS: Record<string, number> = {
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const STOPWORDS = new Set(["setiap", "per", "di", "dan", "untuk", "yang", "dari", "ke", "dalam", "kali", "lebih", "hanya", "sampai", "of", "in", "per", "and", "for", "to", "a", "the", "every", "more", "only", "than", "out", "on", "at"]);
const COUNTABLE = /^(tips?|cara|langkah|hal|alasan|kesalahan|kebiasaan|rahasia|aturan|trik|ways?|steps?|things?|reasons?|mistakes?|habits?|secrets?|rules?|tricks?|ideas?|ide)$/i;
const CTA = /\b(follow|ikuti|subscribe|share|bagikan|klik|click|tap|ketuk|coba|try|download|unduh|daftar|sign up|join|gabung|komentar|comment|like|save|simpan|order|pesan sekarang|beli sekarang|buy now|kunjungi|visit|link in bio|cek|check out|mulai sekarang|start now|start today|mulai hari ini)\b/i;

/** The call-to-action word of a sentence ("FOLLOW", "START NOW"), or null; "like", "save" or "try" count only when they ask something of the viewer. */
function findCta(plain: string): string | null {
  for (const m of plain.matchAll(new RegExp(CTA.source, "gi"))) {
    const at = m.index ?? 0;
    if (isCallToAction(m[1], plain.slice(0, at), plain.slice(at + m[0].length))) return m[1].toUpperCase();
  }
  return null;
}

function trimPhrase(s: string): string {
  return s.replace(/^[\s,;:—–-]+|[\s,.;:!?—–-]+$/g, "").replace(/^(dan|and|tapi|but|yang|that)\s+/i, "").slice(0, 42).trim();
}

export function detectCompare(text: string): CompareInfo | null {
  const t = stripMarks(text).trim();
  let m = /^(?:(.*?)\b)?(?:bukan|not)\s+(.+?),?\s+(?:tapi|tetapi|melainkan|but)\s+(.+)$/i.exec(t);
  if (m && m[2] && m[3]) return { bad: trimPhrase(m[2]), good: trimPhrase(m[3]), neutral: false };
  m = /^(.+?),\s*(?:bukan|not)\s+(.+)$/i.exec(t);
  if (m) return { bad: trimPhrase(m[2]), good: trimPhrase(m[1]), neutral: false };
  m = /^(.+?)\s+(?:lebih baik (?:dari|daripada)|better than|beats|mengalahkan)\s+(.+)$/i.exec(t);
  if (m) return { bad: trimPhrase(m[2]), good: trimPhrase(m[1]), neutral: false };
  m = /^(.+?)\s+(?:instead of|daripada)\s+(.+)$/i.exec(t);
  if (m) return { bad: trimPhrase(m[2]), good: trimPhrase(m[1]), neutral: false };
  m = /^(.+?)\s+(?:vs\.?|versus|atau|or)\s+(.+?)\??$/i.exec(t);
  if (m && /\b(vs\.?|versus)\b/i.test(t)) return { bad: trimPhrase(m[1]), good: trimPhrase(m[2]), neutral: true };
  // Ordinary contrast clauses also have two usable sides, even without an explicit "not X but Y" construction.
  m = /^(.+?),?\s+(?:tetapi|tapi|namun|whereas|but|however)\s+(.+)$/i.exec(t);
  if (m) return { bad: trimPhrase(m[1]), good: trimPhrase(m[2]), neutral: true };
  return null;
}

export function detectNumber(text: string): NumberInfo | null {
  const t = stripMarks(text);
  const m = /(rp\.?\s?|\$)?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?:\s*(%|persen\b|percent\b|x\b|kali\b|times\b|jt\b|jutaan\b|juta\b|million\b|miliar\b|milyar\b|triliun\b|billion\b|rb\b|ribuan\b|ribu\b|k\b|thousand\b))?(?:\s+([\p{L}]+))?/iu.exec(t);
  if (m) {
    const raw = m[2];
    const grouped = /^\d{1,3}([.,]\d{3})+$/.test(raw);
    const value = grouped ? Number(raw.replace(/[.,]/g, "")) : Number(raw.replace(",", "."));
    const decimals = grouped || !/[.,]/.test(raw) ? 0 : raw.split(/[.,]/)[1].length;
    // "5 jutaan" is about five million: the "-an" only says "roughly", so it is shown as the base unit.
    const unit = (m[3] ?? "").toLowerCase().replace(/^(juta|ribu)an$/, "$1");
    const suffix = unit === "%" || unit === "persen" || unit === "percent" ? "%" : unit === "x" || unit === "kali" || unit === "times" ? "×" : unit ? " " + unit : "";
    const prefix = !m[1] ? "" : m[1].trim().startsWith("$") ? "$" : "Rp";
    const next = (m[4] ?? "").toLowerCase();
    // Show the following noun ("5 cara", "3 tips") but not connecting words or labels after money/units.
    const label = prefix || suffix.trim() || !next || STOPWORDS.has(next) ? "" : m[4];
    const year = !grouped && !prefix && !suffix && /^\d{4}$/.test(raw) && value >= 1000 && value <= 2100;
    return { value, decimals, prefix, suffix, label, raw, year };
  }
  const words = t.split(/\s+/).map(wordKey);
  for (let i = 0; i < words.length - 1; i++) {
    const n = NUMBER_WORDS[words[i]];
    // "one"/"satu" usually reads as a phrase ("one small step"), and a counter showing 1 says little.
    if (n === 1) continue;
    if (n && COUNTABLE.test(words[i + 1] ?? "")) return { value: n, decimals: 0, prefix: "", suffix: "", label: words[i + 1], raw: words[i], year: false };
    if (n && COUNTABLE.test(words[i + 2] ?? "")) return { value: n, decimals: 0, prefix: "", suffix: "", label: words[i + 2], raw: words[i], year: false };
  }
  return null;
}

/** Strong, bilingual phrase matching used by the visual detector before generic concept matching. */
export function detectSemanticConcept(text: string): string | null {
  const t = stripMarks(text).toLocaleLowerCase("id");
  const rules: [string, RegExp][] = [
    ["book", /\b(al[- ]?qur.?an|qur.?an|quran|ayat|surah|surat)\b/i],
    ["home", /\b(masjid|mushola|musala|mosque)\b/i],
    ["calm", /\b(doa|berdoa|pray|prayer|dzikir|zikir|dhikr|shalat|salat|ibadah|worship)\b/i],
    ["heart", /\b(iman|takwa|taqwa|ikhlas|sabar|syukur|tawakal|tawakkul|faith|gratitude|sincerity)\b/i],
    ["work", /\b(bisnis|usaha|penghasilan|pendapatan|profit|revenue|business|entrepreneur|wirausaha|pelanggan|customer)\b/i],
    ["ai", /\b(ai|kecerdasan buatan|artificial intelligence|machine learning|otomatisasi|automation|teknologi|technology|software|coding|programming|aplikasi|app|digital)\b/i],
    ["data", /\b(data|statistik|analitik|analytics|dashboard|riset|research|laporan|report)\b/i],
    ["book", /\b(belajar|pembelajaran|pendidikan|pelajaran|mengajar|guru|siswa|murid|education|learning|teach|teacher|student|study|lesson)\b/i],
    ["heart", /\b(cinta|kasih sayang|peduli|compassion|love|kindness|empathy)\b/i],
    ["growth", /\b(berkembang|pertumbuhan|kemajuan|progres|growth|progress|improve|improvement)\b/i],
    ["challenge", /\b(masalah|tantangan|hambatan|rintangan|problem|challenge|obstacle|struggle)\b/i],
    ["solution", /\b(solusi|pemecahan|jawaban|solution|resolve|fix|answer)\b/i],
    ["video", /\b(video|konten|reels|shorts|tiktok|youtube|creator|kreator|editing|editing video)\b/i],
  ];
  for (const [id, pattern] of rules) if (pattern.test(t)) return id;
  return null;
}

/** Automatic visual for one scene. */
/** `topics`: concepts of the neighbouring scenes (see sceneTopics); without them generic words stay silent. */
export function detectVisual(text: string, topics?: ReadonlySet<string>): SceneVisual {
  const plain = stripMarks(text).trim();
  const manual = [...text.matchAll(/\*([^*]+)\*/g)].flatMap(m => m[1].split(/\s+/).map(wordKey)).filter(Boolean);
  // A popular name ("YouTube") is the most specific thing a sentence can say, so it comes before everything else.
  const brands = matchBrands(text);
  const semanticId = detectSemanticConcept(text);
  const concept = matchConcept(text, topics);
  const icon = brands.length ? brands[0].id : semanticId && ICONS[semanticId] ? semanticId : concept?.id ?? null;
  const emphasis = new Set<string>([...manual, ...(manual.length ? [] : brands.length ? brands.map(b => b.word) : concept?.words ?? [])]);
  const withBrands = <T extends object>(v: T): T & { brands?: BrandMention[] } => (brands.length ? { ...v, brands } : v);

  for (const [re, index] of ORDINALS) {
    const m = re.exec(plain);
    if (m) return withBrands({ template: "list", icon, emphasis: [...emphasis], listIndex: index, listLabel: m[1] });
  }
  const step = /^(?:langkah|step|tip|tips|cara|no\.?)\s*(\d+)\b|^(\d+)[.)]\s/i.exec(plain);
  if (step) return withBrands({ template: "list", icon, emphasis: [...emphasis], listIndex: Number(step[1] ?? step[2]), listLabel: "" });

  const compare = detectCompare(plain);
  if (compare) return withBrands({ template: "compare", icon, emphasis: [...emphasis], compare });
  if (/\?\s*$/.test(plain)) return withBrands({ template: "question", icon: icon === "problem" ? null : icon, emphasis: [...emphasis] });
  const number = detectNumber(plain);
  if (number) {
    emphasis.add(wordKey(number.raw));
    return withBrands({ template: "number", icon, emphasis: [...emphasis], number });
  }
  const cta = findCta(plain);
  if (cta) return withBrands({ template: "cta", icon, emphasis: [...emphasis], cta });
  if (/^["“].+["”][.!]?$/.test(plain)) return withBrands({ template: "quote", icon, emphasis: [...emphasis] });
  return withBrands({ template: "statement", icon, emphasis: [...emphasis] });
}

/**
 * What each scene's neighbours (two scenes either side) are about, as concept ids. This is the "whole script" context
 * that lets a generic word count when the script is clearly on that subject, and keeps it silent otherwise.
 */
export function sceneTopics(texts: string[]): Set<string>[] {
  const own = texts.map(t => detectSemanticConcept(t) ?? matchConcept(t)?.id ?? null);
  return texts.map((_, i) => new Set(own.filter((id, j) => id !== null && j !== i && Math.abs(j - i) <= 2) as string[]));
}

/** Applies a user override; data the forced template needs is filled in when the text allows it. */
export function resolveVisual(text: string, override?: VisualOverride, topics?: ReadonlySet<string>): SceneVisual {
  const auto = detectVisual(text, topics);
  if (!override) return auto;
  const v: SceneVisual = { ...auto };
  if (override.template && override.template !== auto.template) {
    v.template = override.template;
    if (v.template === "number") v.number = detectNumber(text) ?? undefined;
    if (v.template === "compare") v.compare = detectCompare(text) ?? undefined;
    if (v.template === "cta") v.cta = findCta(stripMarks(text)) ?? (/\b(the|you|your)\b/i.test(text) ? "START NOW" : "MULAI");
    if (v.template === "list" && v.listIndex === undefined) v.listIndex = null;
  }
  if (override.icon) v.icon = override.icon === "none" ? null : override.icon in ICONS ? override.icon : v.icon;
  if (override.icon) delete v.brands; // an icon chosen by hand replaces the detected names
  if (override.icon && v.icon) v.iconPinned = true;
  return v;
}

export function templateLabel(t: Template): string {
  return TEMPLATES.find(x => x.id === t)?.label ?? t;
}

/**
 * What a source-video scene shows: the speaker alone, the speaker with an animation drawn over the picture ("overlay"),
 * a full-screen graphic ("graphic"), or another part of the same video ("clip"). The speaker's audio never changes.
 */
export type Cut = "video" | "overlay" | "graphic" | "clip";

