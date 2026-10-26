/**
 * Deterministic narrative-to-visual planning.
 *
 * This is a transparent heuristic, not an AI model: it assigns a tentative scene role,
 * visual strategy and motion intensity from wording and position. Creators can override
 * the visual itself; the plan must never be presented as certain interpretation.
 */
export type NarrativeRole = "hook" | "tension" | "explanation" | "reveal" | "application" | "resolution" | "continuation";
export type VisualStrategy = "typography" | "comparison" | "diagram" | "metaphor" | "footage" | "minimal";
export type MotionIntensity = "quiet" | "emphasis" | "impact";

export type NarrativePlan = {
  role: NarrativeRole;
  strategy: VisualStrategy;
  intensity: MotionIntensity;
  reason: string;
  continuityCue: string;
};

const patterns = {
  tension: /\b(namun|tetapi|tapi|padahal|masalahnya|gagal|sebaliknya|bukan|but|however|although|instead|problem|fail|why)\b/i,
  explanation: /\b(karena|sebab|sehingga|akibatnya|artinya|berarti|yaitu|misalnya|contohnya|because|therefore|thus|means|for example|such as|how)\b/i,
  reveal: /\b(ternyata|sebenarnya|kuncinya|jawabannya|faktanya|yang terjadi|in fact|actually|the key|the answer|revealed)\b/i,
  application: /\b(mulai|lakukan|gunakan|coba|praktikkan|terapkan|langkah|pilih|buatlah|gunakan|start|use|try|apply|practice|step|choose|build)\b/i,
  resolution: /\b(kesimpulannya|intinya|jadi|akhirnya|ingatlah|pesan utamanya|takeaway|in conclusion|in short|remember|ultimately)\b/i,
  comparison: /\b(dibandingkan|berbeda|sementara|daripada|vs\.?|versus|lebih .* daripada|compare|compared|whereas|rather than|instead of)\b/i,
  cause: /\b(karena|sebab|sehingga|akibat|mempengaruhi|menyebabkan|dampak|because|causes?|leads? to|affects?|impact|result)\b/i,
  concrete: /\b(ponsel|telepon|meja|buku|pintu|jalan|rumah|orang|tangan|phone|desk|book|door|road|home|person|hand|screen|app)\b/i,
};

export function planNarrative(texts: string[]): NarrativePlan[] {
  return texts.map((raw, index) => {
    const text = raw.replace(/\*([^*]+)\*/g, "$1").trim();
    const first = index === 0;
    const last = index === texts.length - 1;
    let role: NarrativeRole = "continuation";
    let strategy: VisualStrategy = "minimal";
    let intensity: MotionIntensity = "quiet";
    let reason = "Pertahankan fokus pada narasi; grafis tambahan belum diperlukan.";
    let continuityCue = index === 0 ? "Mulai dengan satu fokus visual yang jelas." : "Pertahankan satu elemen atau gagasan dari adegan sebelumnya.";

    if (first) {
      role = "hook";
      strategy = /\\?\\s*$/.test(text) ? "typography" : patterns.concrete.test(text) ? "footage" : "typography";
      intensity = "impact";
      reason = "Buka dengan satu fokus dan hierarki teks yang jelas; ini rekomendasi awal yang dapat diabaikan kreator.";
      continuityCue = "Perkenalkan satu objek, pertanyaan, atau gagasan yang bisa berkembang pada adegan berikutnya.";
    } else if (patterns.resolution.test(text) || (last && !patterns.application.test(text) && !patterns.tension.test(text) && !patterns.explanation.test(text))) {
      role = "resolution";
      strategy = "typography";
      intensity = "quiet";
      reason = "Adegan ini berpotensi menutup alur; beri ruang agar kesimpulan mudah diingat.";
      continuityCue = "Rangkum gagasan sebelumnya, jangan membuka visual baru yang tidak perlu.";
    } else if (patterns.reveal.test(text)) {
      role = "reveal";
      strategy = "metaphor";
      intensity = "emphasis";
      reason = "Bahasa menandai insight atau jawaban; tampilkan perubahan atau hubungan yang memperjelas penemuan.";
      continuityCue = "Gunakan elemen dari pertanyaan atau konflik sebelumnya untuk memperlihatkan jawabannya.";
    } else if (patterns.tension.test(text) || /\?\s*$/.test(text)) {
      role = "tension";
      strategy = patterns.comparison.test(text) ? "comparison" : "typography";
      intensity = "impact";
      reason = "Kalimat mengandung pertanyaan atau kontras; tonjolkan kesenjangan yang perlu dipahami.";
      continuityCue = "Hubungkan masalah ini dengan klaim atau situasi yang baru saja diperkenalkan.";
    } else if (patterns.explanation.test(text)) {
      role = "explanation";
      strategy = patterns.cause.test(text) ? "diagram" : "footage";
      intensity = "quiet";
      reason = "Kalimat berfungsi menjelaskan hubungan atau alasan; prioritaskan visual yang menerangkan, bukan dekorasi.";
      continuityCue = "Pertahankan istilah atau objek yang sama saat menjelaskan hubungannya.";
    } else if (patterns.application.test(text)) {
      role = "application";
      strategy = "footage";
      intensity = "emphasis";
      reason = "Kalimat mengarah pada tindakan; tunjukkan contoh konkret atau langkah yang bisa dilakukan.";
      continuityCue = "Terjemahkan penjelasan sebelumnya menjadi tindakan yang terlihat.";
    } else if (first) {
      role = "hook";
      strategy = /\?\s*$/.test(text) ? "typography" : patterns.concrete.test(text) ? "footage" : "typography";
      intensity = "impact";
      reason = "Adegan pembuka perlu memberi orientasi dan alasan untuk mengikuti cerita, tanpa efek dekoratif berlebihan.";
      continuityCue = "Perkenalkan satu objek, pertanyaan, atau gagasan yang bisa berkembang pada adegan berikutnya.";
    } else if (patterns.comparison.test(text)) {
      role = "tension";
      strategy = "comparison";
      intensity = "emphasis";
      reason = "Kalimat membandingkan dua gagasan; tampilkan keduanya dengan tata letak yang konsisten.";
      continuityCue = "Pertahankan posisi dan skala kedua sisi agar perbandingan mudah diikuti.";
    } else if (patterns.concrete.test(text)) {
      role = "application";
      strategy = "footage";
      intensity = "emphasis";
      reason = "Ada objek atau situasi konkret yang dapat memperjelas pesan lebih baik daripada ikon generik.";
      continuityCue = "Gunakan objek konkret sebagai jembatan ke adegan berikutnya.";
    } else if (first) {
      role = "hook";
      strategy = "typography";
      intensity = "impact";
      reason = "Buka dengan satu fokus dan hierarki teks yang jelas.";
    }

    return { role, strategy, intensity, reason, continuityCue };
  });
}
