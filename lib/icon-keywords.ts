// Turns what a scene says into an icon search keyword. The creator's words are mostly Indonesian and Iconify's index is English, so a
// small dictionary maps frequent words to the icon names the line-icon sets use (checked first, no request wasted on a search).
import { ICON_SETS } from "./iconify";

/** Indonesian / English word -> Lucide icon name (also a good search keyword for the other sets). */
export const ICON_WORDS: Record<string, string> = {
  untung: "trending-up", laba: "trending-up", profit: "trending-up", naik: "trending-up", tumbuh: "trending-up", growth: "trending-up", cuan: "trending-up",
  rugi: "trending-down", turun: "trending-down", loss: "trending-down", anjlok: "trending-down",
  waktu: "clock", jam: "clock", menit: "clock", deadline: "clock", time: "clock", terlambat: "clock",
  tunggu: "hourglass", menunggu: "hourglass", sabar: "hourglass", wait: "hourglass",
  tanggal: "calendar", jadwal: "calendar", kalender: "calendar", hari: "calendar",
  uang: "coins", duit: "coins", gaji: "coins", harga: "tag", murah: "tag", diskon: "percent", promo: "percent", money: "coins", price: "tag", sale: "percent",
  tabungan: "piggy-bank", nabung: "piggy-bank", dompet: "wallet", bayar: "credit-card", pembayaran: "credit-card", payment: "credit-card",
  belanja: "shopping-cart", beli: "shopping-cart", toko: "store", produk: "package", barang: "package", kirim: "truck", pengiriman: "truck",
  bisnis: "briefcase", usaha: "briefcase", kerja: "briefcase", pekerjaan: "briefcase", karir: "briefcase", business: "briefcase",
  mulai: "rocket", luncurkan: "rocket", peluncuran: "rocket", meluncur: "rocket", roket: "rocket", launch: "rocket", start: "rocket",
  ide: "lightbulb", gagasan: "lightbulb", inspirasi: "lightbulb", idea: "lightbulb", solusi: "puzzle", solution: "puzzle",
  target: "target", tujuan: "target", fokus: "crosshair", goal: "target",
  juara: "trophy", menang: "trophy", sukses: "trophy", berhasil: "trophy", prestasi: "trophy", win: "trophy",
  terbaik: "star", bintang: "star", favorit: "star", best: "star",
  api: "flame", panas: "flame", semangat: "flame", viral: "flame", trending: "flame",
  energi: "zap", cepat: "zap", kilat: "zap", tenaga: "zap", fast: "zap", power: "zap",
  aman: "shield-check", keamanan: "shield-check", lindungi: "shield-check", proteksi: "shield-check", secure: "shield-check", safe: "shield-check",
  rahasia: "lock", privasi: "lock", kunci: "key-round", password: "key-round", sandi: "key-round",
  cinta: "heart", sayang: "heart", suka: "thumbs-up", love: "heart", like: "thumbs-up",
  sehat: "heart-pulse", kesehatan: "heart-pulse", dokter: "stethoscope", obat: "pill", health: "heart-pulse",
  olahraga: "dumbbell", latihan: "dumbbell", gym: "dumbbell", lari: "footprints", langkah: "footprints",
  tidur: "moon", malam: "moon", istirahat: "bed", sleep: "moon",
  pagi: "sun", matahari: "sun", cerah: "sun", morning: "sun",
  makan: "utensils", makanan: "utensils", masak: "chef-hat", resep: "chef-hat", food: "utensils",
  minum: "cup-soda", air: "droplets", kopi: "coffee", teh: "coffee", coffee: "coffee",
  buku: "book-open", belajar: "book-open", baca: "book-open", ilmu: "book-open", sekolah: "graduation-cap", kuliah: "graduation-cap", lulus: "graduation-cap", learn: "book-open",
  otak: "brain", pikiran: "brain", pintar: "brain", mind: "brain",
  tulis: "pen-line", menulis: "pen-line", catatan: "notebook-pen", write: "pen-line",
  bicara: "message-circle", obrolan: "message-circle", komentar: "message-circle", chat: "message-circle", pesan: "mail", email: "mail",
  tim: "users", orang: "users", pelanggan: "users", komunitas: "users", team: "users", customer: "users",
  kerjasama: "handshake", kolaborasi: "handshake", sepakat: "handshake", partner: "handshake", deal: "handshake",
  bantu: "hand-helping", bantuan: "hand-helping", dukung: "hand-helping", help: "hand-helping",
  pemimpin: "crown", raja: "crown", leader: "crown", premium: "crown",
  berharga: "gem", mewah: "gem", langka: "gem", value: "gem", luxury: "gem",
  adil: "scale", hukum: "scale", seimbang: "scale", balance: "scale",
  senang: "smile", bahagia: "smile", tersenyum: "smile", senyum: "smile", happy: "smile", sedih: "frown", kecewa: "frown", marah: "angry",
  bahaya: "triangle-alert", awas: "triangle-alert", peringatan: "triangle-alert", hati: "triangle-alert", warning: "triangle-alert",
  salah: "circle-x", jangan: "circle-x", gagal: "circle-x", benar: "circle-check", betul: "circle-check", selesai: "circle-check", cek: "circle-check", done: "circle-check",
  masalah: "circle-help", pertanyaan: "circle-help", bingung: "circle-help", kenapa: "circle-help", mengapa: "circle-help", question: "circle-help",
  data: "chart-column", statistik: "chart-column", grafik: "chart-line", analisis: "chart-line", angka: "hash", laporan: "file-text",
  ponsel: "smartphone", hp: "smartphone", aplikasi: "smartphone", app: "smartphone", laptop: "laptop", komputer: "monitor",
  internet: "globe", dunia: "globe", global: "globe", website: "globe", web: "globe", wifi: "wifi",
  kamera: "camera", foto: "camera", video: "video", film: "clapperboard", musik: "music", lagu: "music", suara: "mic", podcast: "mic",
  rumah: "house", properti: "house", kota: "building-2", kantor: "building-2", mobil: "car", motor: "bike", sepeda: "bike", pesawat: "plane", liburan: "plane", travel: "plane",
  lokasi: "map-pin", tempat: "map-pin", peta: "map", cari: "search", temukan: "search", search: "search",
  baru: "sparkles", ajaib: "sparkles", keren: "sparkles", magic: "sparkles", new: "sparkles",
  gratis: "gift", hadiah: "gift", bonus: "gift", free: "gift", gift: "gift",
  ulang: "repeat", kebiasaan: "repeat", rutin: "repeat", habit: "repeat", tumbuhan: "sprout", tanaman: "sprout", awal: "sprout",
  gunung: "mountain", tantangan: "mountain", puncak: "mountain", challenge: "mountain",
  bagikan: "share-2", sebarkan: "share-2", share: "share-2", simpan: "bookmark", save: "bookmark",
};

// Light Indonesian stemming, so "keuntungan", "menabung" and "berjualan" reach their dictionary word.
const PREFIXES = ["meng", "meny", "mem", "men", "me", "ber", "ter", "di", "pe", "per", "peng", "peny", "pem", "pen", "ke", "se"];
const SUFFIXES = ["kan", "nya", "lah", "kah", "an", "i"];
export function stem(word: string): string[] {
  const w = word.toLowerCase();
  const out = new Set([w]);
  const strip = (s: string) => { for (const suf of SUFFIXES) if (s.length > suf.length + 2 && s.endsWith(suf)) return s.slice(0, -suf.length); return s; };
  for (const base of [w, strip(w)]) {
    out.add(base);
    for (const p of PREFIXES) if (base.startsWith(p) && base.length > p.length + 2) { const rest = base.slice(p.length); out.add(rest); out.add(strip(rest)); if (p.startsWith("men") || p.startsWith("mem") || p.startsWith("meng") || p.startsWith("peng") || p.startsWith("pem") || p.startsWith("pen")) { out.add("t" + rest); out.add("s" + rest); out.add("p" + rest); out.add("k" + rest); } }
  }
  return [...out];
}

/** Icon names for the words of a scene, in the order the words appear (first match first, no duplicates). */
export function iconNamesFor(text: string): string[] {
  const names: string[] = [];
  for (const raw of text.toLowerCase().replace(/[^\p{L}\s-]/gu, " ").split(/\s+/)) {
    if (!raw) continue;
    for (const s of stem(raw)) { const n = ICON_WORDS[s]; if (n) { if (!names.includes(n)) names.push(n); break; } }
  }
  return names;
}

/**
 * What to look up for a scene. `exact` are "lucide:name" candidates to fetch directly (no search request); `query` is the search
 * phrase if none of them works. The director's English `imageQuery` wins when present; then the dictionary; then the longest words.
 */
export function iconLookupFor(text: string, imageQuery?: string): { exact: string[]; query: string } {
  const prefix = Object.keys(ICON_SETS)[0];
  const q = (imageQuery ?? "").replace(/\s+/g, " ").trim();
  const mapped = iconNamesFor(text);
  const exact = mapped.slice(0, 2).map(n => `${prefix}:${n}`);
  if (q) return { exact: q.split(" ").length === 1 && ICON_WORDS[q.toLowerCase()] ? [`${prefix}:${ICON_WORDS[q.toLowerCase()]}`] : [], query: q.split(" ").slice(0, 2).join(" ") };
  const fallback = text.replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(w => w.length >= 4).sort((a, b) => b.length - a.length).slice(0, 2).join(" ");
  return { exact, query: mapped[0]?.replace(/-/g, " ") ?? fallback };
}
