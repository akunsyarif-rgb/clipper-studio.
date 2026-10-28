/**
 * Deterministic, script-first narrative analysis.
 *
 * A scene plan is a recommendation rather than a claim about authorial intent. It combines
 * linguistic signals, narrative position and whole-script context, stays local, and is safe
 * to use when no AI service or network is available.
 */
export type NarrativeRole = "hook" | "tension" | "explanation" | "reveal" | "application" | "resolution" | "continuation";
export type VisualStrategy = "typography" | "comparison" | "diagram" | "metaphor" | "footage" | "minimal";
export type MotionIntensity = "quiet" | "emphasis" | "impact";
export type NarrativeIntent = "question" | "contrast" | "cause-effect" | "process" | "evidence" | "insight" | "instruction" | "story" | "reflection" | "resolution" | "statement";

export type NarrativePlan = {
  role: NarrativeRole;
  strategy: VisualStrategy;
  intensity: MotionIntensity;
  reason: string;
  continuityCue: string;
  /** The main communicative job of this beat, separate from its visual treatment. */
  intent: NarrativeIntent;
  /** Short semantic cue used by the visual director; not a generated replacement for the script. */
  visualCue: string;
  /** Confidence in deterministic signals, not a probability that the interpretation is correct. */
  confidence: "low" | "medium" | "high";
  /** Index of the nearest previous/next beat sharing the detected topic, where available. */
  continuity: { previousRelated: number | null; nextRelated: number | null };
};

const patterns = {
  tension: /\b(namun|tetapi|tapi|padahal|masalahnya|gagal|sebaliknya|bukan|meski|walau|sulit|tantangan|hambatan|but|however|although|instead|problem|fail|struggle|challenge|obstacle)\b/i,
  explanation: /\b(karena|sebab|sehingga|akibatnya|artinya|berarti|yaitu|misalnya|contohnya|maksudnya|disebabkan|mengakibatkan|because|therefore|thus|means|for example|such as|how|due to|as a result)\b/i,
  reveal: /\b(ternyata|sebenarnya|kuncinya|jawabannya|faktanya|yang terjadi|rahasianya|intinya adalah|in fact|actually|the key|the answer|revealed|the truth)\b/i,
  application: /\b(mulai|lakukan|gunakan|coba|praktikkan|terapkan|langkah|pilih|buatlah|susun|pertama|kedua|ketiga|terakhir|berikutnya|start|use|try|apply|practice|step|choose|build|first|second|next|finally)\b/i,
  resolution: /\b(kesimpulannya|intinya|jadi|akhirnya|ingatlah|pesan utamanya|penutupnya|takeaway|in conclusion|in short|remember|ultimately|the lesson)\b/i,
  comparison: /\b(dibandingkan|berbeda|sementara|daripada|lebih .* daripada|bukan .* melainkan|vs\.?|versus|compare|compared|whereas|rather than|instead of|unlike)\b/i,
  cause: /\b(karena|sebab|sehingga|akibat|mempengaruhi|menyebabkan|dampak|oleh karena|berujung|because|causes?|leads? to|affects?|impact|result|therefore|as a result)\b/i,
  process: /\b(pertama|kedua|ketiga|selanjutnya|setelah itu|kemudian|terakhir|langkah|tahap|proses|urutan|first|second|next|then|finally|step|stage|process|sequence)\b/i,
  data: /\b(\d+(?:[.,]\d+)?\s*(?:%|persen|percent|rupiah|rp\.?|dolar|usd|juta|miliar|million|billion|kali|x\b|tahun|bulan|hari|minggu))\b/i,
  question: /\?\s*$/,
  story: /\b(suatu hari|waktu itu|ketika|dahulu|pernah|kisah|cerita|akhirnya ia|pada suatu|one day|once|when i|when we|story|remember when)\b/i,
  reflection: /\b(iman|syukur|sabar|ikhlas|doa|hati|hidup|makna|mengingat|merenung|jiwa|tujuan hidup|faith|gratitude|patience|prayer|heart|life|meaning|reflect)\b/i,
  concrete: /\b(ponsel|telepon|meja|buku|pintu|jalan|rumah|orang|tangan|layar|aplikasi|kamera|kursi|mobil|phone|desk|book|door|road|home|person|hand|screen|app|camera|car)\b/i,
  metaphor: /\b(seperti|ibarat|bagaikan|layaknya|adalah jembatan|fondasi|akar masalah|peta jalan|kompas|seperti mesin|like a|as a|is a bridge|foundation|root cause|roadmap|compass|engine)\b/i,
};

const topicRules: [string, RegExp][] = [
  ["habit", /\b(kebiasaan|disiplin|konsisten|rutinitas|habit|discipline|consistent|routine)\b/i],
  ["learning", /\b(belajar|pendidikan|mengajar|guru|siswa|ilmu|latihan|learning|education|teach|teacher|student|practice|study)\b/i],
  ["faith", /\b(iman|takwa|ikhlas|sabar|syukur|doa|ibadah|salat|shalat|quran|ayat|faith|prayer|worship|gratitude)\b/i],
  ["business", /\b(bisnis|usaha|pelanggan|penjualan|pemasaran|produk|harga|profit|customer|sales|marketing|product|price|revenue)\b/i],
  ["technology", /\b(ai|aplikasi|software|kode|coding|otomatisasi|teknologi|data|digital|app|software|code|automation|technology|digital)\b/i],
  ["health", /\b(tidur|makan|olahraga|sehat|tubuh|napas|sleep|food|exercise|health|body|breathing)\b/i],
  ["emotion", /\b(takut|cemas|sedih|bahagia|marah|percaya diri|fear|anxious|sad|happy|anger|confidence)\b/i],
  ["time", /\b(waktu|hari|menit|jam|masa depan|masa lalu|time|day|minute|hour|future|past)\b/i],
  ["money", /\b(uang|gaji|tabungan|utang|investasi|rupiah|money|salary|saving|debt|investment)\b/i],
  ["growth", /\b(tumbuh|berkembang|kemajuan|progres|perubahan|growth|develop|progress|change|improve)\b/i],
  ["story", /\b(kisah|cerita|pengalaman|pernah|ketika|story|experience|once|when)\b/i],
];

function topicOf(text: string): string | null {
  for (const [id, re] of topicRules) if (re.test(text)) return id;
  return null;
}

function intentOf(text: string): NarrativeIntent {
  if (patterns.question.test(text)) return "question";
  if (patterns.resolution.test(text)) return "resolution";
  if (patterns.comparison.test(text) || /\b(bukan|melainkan|tetapi|tapi|however|whereas)\b/i.test(text)) return "contrast";
  if (patterns.cause.test(text)) return "cause-effect";
  if (patterns.process.test(text) || /^(?:\d+[.)]|langkah\s+\d+)/i.test(text)) return "process";
  if (patterns.data.test(text)) return "evidence";
  if (patterns.reveal.test(text)) return "insight";
  if (patterns.application.test(text)) return "instruction";
  if (patterns.story.test(text)) return "story";
  if (patterns.reflection.test(text)) return "reflection";
  return "statement";
}

function visualCueFor(intent: NarrativeIntent, topic: string | null): string {
  const topicLabel = topic ? topic.replace(/-/g, " ") : "gagasan utama";
  const cue: Record<NarrativeIntent, string> = {
    question: "Tampilkan satu pertanyaan atau objek fokus yang membuka ruang penasaran",
    contrast: "Pisahkan dua gagasan dengan posisi dan bobot visual yang jelas",
    "cause-effect": "Hubungkan penyebab dan akibat dengan alur yang dapat diikuti",
    process: "Tampilkan urutan langkah dan progres secara bertahap",
    evidence: "Jadikan angka atau bukti sebagai fokus, lalu beri konteks",
    insight: "Ungkap inti gagasan dari visual sebelumnya dengan perubahan yang bermakna",
    instruction: "Tunjukkan satu tindakan yang dapat dilakukan penonton",
    story: "Bangun adegan dengan konteks, peristiwa, dan perubahan",
    reflection: "Gunakan ruang, tipografi, dan gerak tenang untuk memberi waktu merenung",
    statement: "Pilih satu hierarki visual yang mendukung gagasan, bukan dekorasi",
    resolution: "Ringkas gagasan utama dan beri ruang untuk mengingatnya",
  };
  return `${cue[intent]}; pertahankan konteks ${topicLabel} bila relevan.`;
}

function roleOf(intent: NarrativeIntent, first: boolean, last: boolean, text: string): NarrativeRole {
  if (first) return "hook";
  if (intent === "resolution") return "resolution";
  if (intent === "contrast") return "tension";
  if (intent === "process") return patterns.application.test(text) ? "application" : "explanation";
  if (intent === "cause-effect" || intent === "evidence") return "explanation";
  if (intent === "insight") return "reveal";
  if (intent === "instruction") return "application";
  if (intent === "reflection" || (last && (intent === "statement" || intent === "story"))) return "resolution";
  if (intent === "story") return "continuation";
  return last ? "resolution" : "continuation";
}

/** Analyze a sequence of scene texts, preserving order and returning an explainable plan per beat. */
export function planNarrative(texts: string[]): NarrativePlan[] {
  const clean = texts.map(raw => raw.replace(/\*([^*]+)\*/g, "$1").replace(/\s+/g, " ").trim());
  const topics = clean.map(topicOf);
  return clean.map((text, index) => {
    const first = index === 0;
    const last = index === clean.length - 1;
    const intent = intentOf(text);
    const role = roleOf(intent, first, last, text);
    const topic = topics[index];
    const related = topics.map((t, i) => t && t === topic && i !== index ? i : null).filter((i): i is number => i !== null);
    const prior = related.filter(i => i < index);
    const previousRelated = prior.length ? prior[prior.length - 1] : null;
    const nextRelated = related.find(i => i > index) ?? null;

    let strategy: VisualStrategy = "minimal";
    let intensity: MotionIntensity = "quiet";
    let confidence: NarrativePlan["confidence"] = "low";
    if (intent === "contrast") {
      strategy = "comparison"; intensity = "impact"; confidence = "high";
    } else if (intent === "cause-effect" || intent === "process") {
      strategy = "diagram"; intensity = "emphasis"; confidence = "high";
    } else if (intent === "evidence") {
      strategy = "typography"; intensity = "impact"; confidence = "high";
    } else if (intent === "insight") {
      strategy = "metaphor"; intensity = "emphasis"; confidence = "medium";
    } else if (intent === "resolution") {
      strategy = "typography"; intensity = "quiet"; confidence = "medium";
    } else if (intent === "instruction") {
      strategy = patterns.concrete.test(text) ? "footage" : "diagram";
      intensity = "emphasis"; confidence = patterns.application.test(text) ? "medium" : "low";
    } else if (intent === "question") {
      strategy = "typography"; intensity = first ? "impact" : "emphasis"; confidence = "high";
    } else if (intent === "story") {
      strategy = patterns.concrete.test(text) ? "footage" : "metaphor";
      intensity = "emphasis"; confidence = "medium";
    } else if (intent === "reflection") {
      strategy = "metaphor"; intensity = "quiet"; confidence = "medium";
    } else if (patterns.metaphor.test(text)) {
      strategy = "metaphor"; intensity = "quiet"; confidence = "medium";
    } else if (patterns.concrete.test(text)) {
      strategy = "footage"; intensity = "emphasis"; confidence = "medium";
    } else if (intent === "statement") {
      strategy = first || last ? "typography" : "minimal";
      intensity = first ? "impact" : "quiet";
      confidence = topic ? "medium" : "low";
    }

    // Narrative role matters too, but the final line is not always a conclusion when it introduces a concrete action.
    const finalRole = last && role === "continuation" ? "resolution" : role;
    const reason = `${intent === "contrast" ? "Kontras terdeteksi" : intent === "cause-effect" ? "Hubungan sebab-akibat terdeteksi" : intent === "process" ? "Urutan langkah terdeteksi" : intent === "evidence" ? "Bukti atau angka terdeteksi" : intent === "insight" ? "Penanda insight terdeteksi" : intent === "instruction" ? "Ajakan tindakan terdeteksi" : intent === "story" ? "Sinyal alur cerita terdeteksi" : intent === "reflection" ? "Bahasa reflektif terdeteksi" : intent === "question" ? "Pertanyaan terdeteksi" : "Kalimat gagasan"}; ${visualCueFor(intent, topic)}.`;
    const continuityCue = previousRelated !== null
      ? `Lanjutkan konsep ${topic}; jadikan perubahan atau implikasi sebagai fokus adegan.`
      : nextRelated !== null
        ? `Perkenalkan konsep ${topic} dan sisakan elemen yang bisa diteruskan pada adegan ${nextRelated + 1}.`
        : index === 0
          ? "Perkenalkan fokus utama dengan jelas; jangan tampilkan terlalu banyak elemen sekaligus."
          : last
            ? "Tutup alur dengan satu gagasan yang mudah diingat; hindari membuka topik baru."
            : "Jembatani adegan ini dengan gagasan sebelum dan sesudahnya menggunakan satu elemen yang konsisten.";

    return {
      role: finalRole,
      strategy,
      intensity,
      reason,
      continuityCue,
      intent,
      visualCue: visualCueFor(intent, topic),
      confidence,
      continuity: { previousRelated, nextRelated },
    };
  });
}
