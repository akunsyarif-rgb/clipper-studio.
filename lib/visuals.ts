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

type Concept = { id: string; label: string; icon: IconNode; words: string[]; weight?: number };

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
  { id: "wallet", label: "Dompet (tabungan)", icon: Wallet, words: ["dompet", "tabung", "tabungan", "hemat", "investasi", "wallet", "saving", "budget", "invest"] },
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
  { id: "sleep", label: "Bulan (tidur)", icon: Moon, words: ["tidur", "malam", "istirahat", "sleep", "night", "rest"] },
  { id: "morning", label: "Matahari (pagi)", icon: Sun, words: ["pagi", "matahari", "siang", "morning", "sunrise", "sun"] },
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
  { id: "like", label: "Jempol", icon: ThumbsUp, words: ["suka", "setuju", "bagus", "like", "agree", "good"] },
  { id: "new", label: "Kilau (baru)", icon: Sparkles, words: ["baru", "keren", "ajaib", "menakjubkan", "new", "amazing", "magic", "wow"] },
  { id: "next", label: "Panah kanan", icon: ArrowRight, words: ["lanjut", "berikutnya", "selanjutnya", "next", "continue"] },
];

export const ICONS: Record<string, { label: string; icon: IconNode }> = Object.fromEntries([
  ...CONCEPTS.map(c => [c.id, { label: c.label, icon: c.icon }] as const),
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
};

export type VisualOverride = { template?: Template; icon?: string | "none" };

/** Removes the *emphasis* markers for display and speech. */
export function stripMarks(text: string): string {
  return text.replace(/\*([^*]+)\*/g, "$1").replace(/\*/g, "");
}

/** Lower-cased word without accents or surrounding punctuation, for keyword and emphasis matching. */
export const wordKey = (w: string) => w.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");

/** Endings allowed after a 4-letter keyword ("main" → "mainkan", "play" → "playing", but not "idea" → "ideal"). */
const SUFFIX = /^(|s|es|ed|d|ing|er|ers|ly|kan|an|i|nya|lah|kah|mu|ku)$/;
const ID_PREFIX = /^(meng|meny|mem|men|me|ber|be|di|ter|per|peng|pem|pen|pe|ke|se)/;

function wordMatches(token: string, keyword: string): boolean {
  if (keyword.includes(" ")) return false;
  if (token === keyword) return true;
  // Up to 3 letters: whole words only ("ai", "ide", "jam"). 4 letters: start of the word or after an
  // Indonesian prefix ("main" → "bermain", not "remain"). 5+: anywhere ("mulai" → "memulai", "dimulai").
  if (keyword.length <= 3) return false;
  if (keyword.length === 4) return [token, token.replace(ID_PREFIX, "")].some(t => t.startsWith(keyword) && SUFFIX.test(t.slice(keyword.length)));
  return token.includes(keyword);
}

/** Best matching concept for the text, with the words that triggered it. */
export function matchConcept(text: string): { id: string; words: string[] } | null {
  const plain = stripMarks(text);
  const tokens = plain.split(/\s+/).map(wordKey).filter(Boolean);
  const lower = " " + tokens.join(" ") + " ";
  let best: { id: string; words: string[]; score: number; pos: number } | null = null;
  for (const c of CONCEPTS) {
    let score = 0, pos = Infinity;
    const words: string[] = [];
    for (const k of c.words) {
      if (k.includes(" ")) {
        const i = lower.indexOf(" " + k + " ");
        if (i >= 0) { score += 1.5; pos = Math.min(pos, i); words.push(...k.split(" ")); }
        continue;
      }
      tokens.forEach((t, i) => { if (wordMatches(t, k)) { score += 1; pos = Math.min(pos, i * 10); words.push(t); } });
    }
    score *= c.weight ?? 1;
    if (score > 0 && (!best || score > best.score || (score === best.score && pos < best.pos))) best = { id: c.id, words, score, pos };
  }
  return best ? { id: best.id, words: [...new Set(best.words)] } : null;
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
  return null;
}

export function detectNumber(text: string): NumberInfo | null {
  const t = stripMarks(text);
  const m = /(rp\.?\s?|\$)?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?:\s*(%|persen\b|percent\b|x\b|kali\b|times\b|jt\b|juta\b|million\b|rb\b|ribu\b|k\b|thousand\b))?(?:\s+([\p{L}]+))?/iu.exec(t);
  if (m) {
    const raw = m[2];
    const grouped = /^\d{1,3}([.,]\d{3})+$/.test(raw);
    const value = grouped ? Number(raw.replace(/[.,]/g, "")) : Number(raw.replace(",", "."));
    const decimals = grouped || !/[.,]/.test(raw) ? 0 : raw.split(/[.,]/)[1].length;
    const unit = (m[3] ?? "").toLowerCase();
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

/** Automatic visual for one scene. */
export function detectVisual(text: string): SceneVisual {
  const plain = stripMarks(text).trim();
  const manual = [...text.matchAll(/\*([^*]+)\*/g)].flatMap(m => m[1].split(/\s+/).map(wordKey)).filter(Boolean);
  const concept = matchConcept(text);
  const icon = concept?.id ?? null;
  const emphasis = new Set<string>([...manual, ...(manual.length ? [] : concept?.words ?? [])]);

  for (const [re, index] of ORDINALS) {
    const m = re.exec(plain);
    if (m) return { template: "list", icon, emphasis: [...emphasis], listIndex: index, listLabel: m[1] };
  }
  const step = /^(?:langkah|step|tip|tips|cara|no\.?)\s*(\d+)\b|^(\d+)[.)]\s/i.exec(plain);
  if (step) return { template: "list", icon, emphasis: [...emphasis], listIndex: Number(step[1] ?? step[2]), listLabel: "" };

  const compare = detectCompare(plain);
  if (compare) return { template: "compare", icon, emphasis: [...emphasis], compare };
  if (/\?\s*$/.test(plain)) return { template: "question", icon: icon === "problem" ? null : icon, emphasis: [...emphasis] };
  const number = detectNumber(plain);
  if (number) {
    emphasis.add(wordKey(number.raw));
    return { template: "number", icon, emphasis: [...emphasis], number };
  }
  const cta = CTA.exec(plain);
  if (cta) return { template: "cta", icon, emphasis: [...emphasis], cta: cta[1].toUpperCase() };
  if (/^["“].+["”][.!]?$/.test(plain)) return { template: "quote", icon, emphasis: [...emphasis] };
  return { template: "statement", icon, emphasis: [...emphasis] };
}

/** Applies a user override; data the forced template needs is filled in when the text allows it. */
export function resolveVisual(text: string, override?: VisualOverride): SceneVisual {
  const auto = detectVisual(text);
  if (!override) return auto;
  const v: SceneVisual = { ...auto };
  if (override.template && override.template !== auto.template) {
    v.template = override.template;
    if (v.template === "number") v.number = detectNumber(text) ?? undefined;
    if (v.template === "compare") v.compare = detectCompare(text) ?? undefined;
    if (v.template === "cta") v.cta = CTA.exec(stripMarks(text))?.[1].toUpperCase() ?? (/\b(the|you|your)\b/i.test(text) ? "START NOW" : "MULAI");
    if (v.template === "list" && v.listIndex === undefined) v.listIndex = null;
  }
  if (override.icon) v.icon = override.icon === "none" ? null : override.icon in ICONS ? override.icon : v.icon;
  return v;
}

export function templateLabel(t: Template): string {
  return TEMPLATES.find(x => x.id === t)?.label ?? t;
}

export type Cut = "video" | "graphic";

/**
 * Edit plan for a source-video edit: the speaker stays on screen by default; a scene with a recognised
 * concept, number, list, question, comparison or call-to-action cuts away to a graphic scene (audio keeps playing).
 * The first scene always shows the speaker, and two graphic scenes never follow each other.
 */
export function autoCuts(visuals: SceneVisual[]): Cut[] {
  const out: Cut[] = [];
  visuals.forEach((v, i) => {
    const meaningful = v.template !== "statement" || !!v.icon;
    out.push(i > 0 && meaningful && out[i - 1] !== "graphic" ? "graphic" : "video");
  });
  return out;
}
