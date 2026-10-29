// Stickers: small animated emoji pops (Twemoji graphics, CC-BY 4.0, self-hosted in public/stickers) that give a scene a quick,
// recognisable visual. The choice is made from what the scene says (Indonesian and English), is deterministic, can be overridden per
// scene, and never repeats the same sticker twice in a row. The artwork needs a credit line wherever it is published (see STICKER_CREDIT).

export type Sticker = { id: string; label: string; emoji: string; /** File name in public/stickers. */ file: string; /** Words (regular expression source, matched case-insensitively on whole words) that call for it. */ words: string };

const S = (id: string, code: string, emoji: string, label: string, words: string): Sticker => ({ id, label, emoji, file: `${code}.svg`, words });

/** Order matters: the first sticker whose words match wins, so specific meanings come before general ones. */
export const STICKERS: Sticker[] = [
  S("alert", "1f6a8", "🚨", "Peringatan", "awas|waspada|bahaya|darurat|peringatan|hati-hati|alert|danger|warning|urgent"),
  S("money-off", "1f4b8", "💸", "Uang melayang", "boros|rugi|kerugian|hutang|utang|pemborosan|bangkrut|waste|debt|loss"),
  S("money", "1f4b0", "💰", "Uang", "uang|duit|gaji|cuan|untung|keuntungan|penghasilan|pendapatan|income|money|profit|salary|rupiah|rp|harga|diskon|promo|murah"),
  S("chart-up", "1f4c8", "📈", "Naik", "naik|meningkat|tumbuh|pertumbuhan|berkembang|growth|increase|grow|sukses|berhasil|progres|progress"),
  S("chart-down", "1f4c9", "📉", "Turun", "turun|menurun|anjlok|merosot|decline|drop|decrease|gagal|kegagalan|failure"),
  S("rocket", "1f680", "🚀", "Roket", "mulai|memulai|luncur|meluncur|start|launch|cepat|kilat|langsung|sekarang|segera|now"),
  S("target", "1f3af", "🎯", "Target", "target|tujuan|fokus|sasaran|goal|focus|aim|tepat"),
  S("brain", "1f9e0", "🧠", "Otak", "otak|pikiran|mindset|berpikir|psikologi|brain|mind|think|mental"),
  S("bulb", "1f4a1", "💡", "Ide", "ide|gagasan|tips|trik|rahasia|kunci|solusi|jawaban|idea|tip|trick|secret|solution|insight"),
  S("alarm", "23f0", "⏰", "Alarm", "alarm|pagi|bangun|jadwal|deadline|tepat waktu|morning|wake"),
  S("hourglass", "231b", "⌛", "Waktu", "waktu|menunggu|tunggu|sabar|nanti|tertunda|time|wait|late|delay|menit|jam"),
  S("mind-blown", "1f92f", "🤯", "Kaget", "mengejutkan|mencengangkan|gila|tak percaya|mind-blown|shocking|unbelievable|ternyata|faktanya"),
  S("shock", "1f62e", "😮", "Terkejut", "wow|kaget|terkejut|surprise|surprised|astaga"),
  S("thinking", "1f914", "🤔", "Berpikir", "mengapa|kenapa|bagaimana|pernah|apakah|why|how|what if|bingung|ragu"),
  S("eyes", "1f440", "👀", "Perhatikan", "lihat|perhatikan|cek|lihatlah|tonton|simak|watch|look|notice|see"),
  S("check", "2705", "✅", "Benar", "benar|betul|berhasil|selesai|lakukan|cukup|yes|correct|done|tepat|terbukti|sudah"),
  S("cross", "274c", "❌", "Salah", "salah|jangan|hindari|larangan|berhenti|stop|never|wrong|avoid|dont|bukan"),
  S("warning", "26a0", "⚠️", "Perhatian", "perhatian|catatan|risiko|resiko|penting|careful|caution|risk|note|ingat"),
  S("fire", "1f525", "🔥", "Api", "panas|semangat|membara|viral|trending|fire|hot|terbaik|mantap|luar biasa|dahsyat"),
  S("muscle", "1f4aa", "💪", "Kuat", "kuat|disiplin|tangguh|berani|konsisten|kerja keras|strong|discipline|strength|bertahan|tekun"),
  S("trophy", "1f3c6", "🏆", "Piala", "juara|menang|prestasi|pemenang|champion|win|winner|achievement|terbaik|juara"),
  S("party", "1f389", "🎉", "Perayaan", "selamat|rayakan|perayaan|syukur|congrats|celebrate|party|bahagia"),
  S("gem", "1f48e", "💎", "Berharga", "berharga|premium|langka|eksklusif|bernilai|valuable|rare|exclusive"),
  S("star", "2b50", "⭐", "Bintang", "bintang|favorit|rating|ulasan|review|star|favorite|unggulan"),
  S("heart", "2764", "❤️", "Hati", "cinta|sayang|kasih|peduli|keluarga|love|care|family|hati|ikhlas"),
  S("clap", "1f64c", "🙌", "Hore", "hore|bersama|dukung|dukungan|support|together|terima kasih|thanks|thank"),
  S("thumbs-up", "1f44d", "👍", "Jempol", "setuju|suka|bagus|rekomendasi|recommend|like|good|oke|cocok"),
  S("handshake", "1f91d", "🤝", "Kerja sama", "kerja sama|kolaborasi|kemitraan|sepakat|deal|partner|collaborat|percaya|trust"),
  S("prayer", "1f64f", "🙏", "Doa", "doa|berdoa|pray|prayer|harap|semoga|mohon|ampun|dzikir|zikir"),
  S("mosque", "1f54c", "🕌", "Masjid", "masjid|mosque|sholat|shalat|salat|ibadah|ramadan|ramadhan|islam|quran|al-quran"),
  S("book", "1f4d6", "📖", "Buku", "buku|belajar|baca|membaca|pelajaran|ilmu|edukasi|book|learn|read|study|kursus|course|sekolah"),
  S("seedling", "1f331", "🌱", "Tunas", "tunas|bibit|tumbuh kecil|mulai kecil|langkah kecil|kecil|bertumbuh|seed|small|sedikit demi sedikit"),
  S("sun", "2600", "☀️", "Matahari", "matahari|cerah|terang|pagi hari|sun|sunny|bright|harapan"),
  S("moon", "1f319", "🌙", "Bulan", "malam|tidur|istirahat|bulan|night|sleep|rest|begadang"),
  S("coffee", "2615", "☕", "Kopi", "kopi|ngopi|santai|coffee|cafe|kafe|teh|minum"),
  S("burger", "1f354", "🍔", "Makanan", "makan|makanan|kuliner|lapar|resep|masak|food|eat|recipe|cook|restoran"),
  S("house", "1f3e0", "🏠", "Rumah", "rumah|properti|tempat tinggal|home|house|property|kos|apartemen"),
  S("laptop", "1f4bb", "💻", "Laptop", "laptop|komputer|kerja|coding|programmer|software|aplikasi|website|situs|work|computer|digital|online|bisnis|freelance"),
  S("phone", "1f4f1", "📱", "Ponsel", "ponsel|hp|handphone|smartphone|media sosial|instagram|tiktok|phone|mobile|scroll"),
  S("camera", "1f4f7", "📷", "Kamera", "foto|kamera|gambar|photo|camera|picture"),
  S("clapper", "1f3ac", "🎬", "Klaker", "video|film|konten|reels|shorts|edit|editing|kreator|creator|content"),
  S("mic", "1f3a4", "🎤", "Mikrofon", "suara|bicara|podcast|berbicara|presentasi|voice|speak|talk|mic"),
  S("megaphone", "1f4e3", "📣", "Pengumuman", "umumkan|pengumuman|ajak|ajakan|ikuti|follow|subscribe|bagikan|share|announce|kabar"),
  S("point-down", "1f447", "👇", "Ke bawah", "di bawah|bawah ini|klik|link|tautan|below|click|komentar|comment|simak di bawah"),
  S("point-right", "1f449", "👉", "Ke kanan", "selanjutnya|berikutnya|lanjut|next|then|kemudian|lalu"),
  S("pin", "1f4cc", "📌", "Pin", "simpan|catat|tandai|pin|save|bookmark|ingat ini"),
  S("key", "1f511", "🔑", "Kunci", "kunci|akses|rahasia sukses|key|access|unlock"),
  S("lock", "1f512", "🔒", "Terkunci", "aman|keamanan|privasi|rahasia|sandi|password|secure|security|private|lindungi"),
  S("search", "1f50d", "🔍", "Cari", "cari|pencarian|riset|selidiki|temukan|search|research|find|investigate|analisis"),
  S("gift", "1f381", "🎁", "Hadiah", "hadiah|gratis|bonus|giveaway|gift|free|kado"),
  S("cart", "1f6d2", "🛒", "Belanja", "belanja|beli|membeli|toko|checkout|shop|buy|cart|jualan|dagang|produk|order"),
  S("calendar", "1f4c5", "📅", "Kalender", "kalender|hari ini|besok|minggu|bulan depan|tahun|jadwal|tanggal|calendar|today|tomorrow|week|year|setiap hari"),
  S("globe", "1f30d", "🌍", "Dunia", "dunia|global|internasional|negara|world|global|international|indonesia"),
  S("sparkles", "2728", "✨", "Kilau", "ajaib|magis|baru|istimewa|spesial|magic|new|special|bersinar|cantik|glowing"),
];

export const STICKER_BY_ID: Record<string, Sticker> = Object.fromEntries(STICKERS.map(s => [s.id, s]));

/** Credit the artwork needs (CC-BY 4.0) wherever a video with stickers is published. */
export const STICKER_CREDIT = "Stiker: Twemoji © Twitter, Inc dan kontributor, lisensi CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/)";

const compiled = STICKERS.map(s => ({ s, re: new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${s.words})(?![\\p{L}\\p{N}])`, "iu") }));

/** The sticker a sentence calls for (first match in catalogue order), or null. */
export function matchSticker(text: string): Sticker | null {
  const plain = text.replace(/\*/g, "").toLocaleLowerCase("id");
  return compiled.find(c => c.re.test(plain))?.s ?? null;
}

export type StickerMode = "off" | "auto";

/**
 * One sticker id (or null) per scene. A creator's choice per scene wins ("none" removes it, an id sets it); otherwise the sentence
 * decides. A sticker is never repeated in the next scene, and at most `maxShare` of the scenes carry one so the video does not turn
 * into a wall of emoji.
 */
export function planStickers(texts: string[], opts: { mode: StickerMode; overrides?: Record<string, string>; maxShare?: number }): (string | null)[] {
  if (opts.mode === "off") return texts.map(() => null);
  const maxShare = opts.maxShare ?? 0.6;
  const budget = Math.max(1, Math.ceil(texts.length * maxShare));
  const out: (string | null)[] = texts.map(() => null);
  let used = 0, previous: string | null = null;
  texts.forEach((text, i) => {
    const manual = opts.overrides?.[text];
    if (manual === "none") { previous = null; return; }
    let id: string | null = manual && STICKER_BY_ID[manual] ? manual : null;
    const forced = id !== null;
    if (!id) id = matchSticker(text)?.id ?? null;
    if (!id) { previous = null; return; }
    if (!forced && (id === previous || used >= budget)) { previous = null; return; }
    out[i] = id; used++; previous = id;
  });
  return out;
}
