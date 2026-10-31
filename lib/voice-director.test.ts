import { describe, expect, it } from "vitest";
import {
  analyzeVoiceScript, analyzeVoiceSegment, applyOverrides, AUDIBLE, audibleKey, emphasisWords, narrationKey, paceToSpeed, parseEmphasis,
  scenePause, segmentKeys, type VoiceDirection,
} from "./voice-director";
import { SPEEDS } from "./tts/narration";
import { spokenForDirection } from "./voice-director";

const one = (t: string, position: "only" | "first" | "middle" | "last" = "middle") => analyzeVoiceSegment(t, { position });

describe("questions are read from the sentence, not from a word inside it", () => {
  it("a marked question is curious, rising, with room to think", () => {
    const d = one("Pernahkah kamu bertanya-tanya?");
    expect(d).toMatchObject({ emotion: "curious", intonation: "rising", pauseAfter: 0.25, confidence: "high" });
    expect(one("Mengapa hal ini bisa terjadi?").intonation).toBe("rising");
  });
  it("an opening question word or -kah word counts even without the mark", () => {
    expect(one("Tahukah kamu apa yang terjadi di sana").intonation).toBe("rising");
    expect(one("Bagaimana cara kerjanya apa adanya").emotion).toBe("curious");
    expect(one("Di mana kamu menyimpan kuncinya").intonation).toBe("rising");
  });
  it("the same words inside a statement do NOT make a question", () => {
    for (const t of ["Saya tahu apa yang kamu rasakan.", "Ini alasan mengapa kami berhenti.", "Aku jelaskan bagaimana caranya dengan sederhana."]) {
      const d = one(t);
      expect(d.intonation, t).not.toBe("rising");
      expect(d.emotion, t).not.toBe("curious");
    }
  });
  it("a heading the author closed with a period is respected as a statement", () => {
    expect(one("Bagaimana cara kerjanya.").intonation).toBe("falling");
  });
  it("words that merely end in -kah are not questions", () => {
    expect(one("Semoga ini jadi berkah bagi kita semua.").intonation).not.toBe("rising");
  });
});

describe("emotion by whole words, with negation", () => {
  it("does not match inside other words", () => {
    expect(one("Tolong hidupkan lampunya sekarang.").emotion).not.toBe("reflective");
    expect(one("Hidup ini singkat, jadi hargai setiap hari.").emotion).toBe("reflective");
    expect(one("Kami menikmati keselamatan kerja di pabrik.").emotion).not.toBe("joyful");
  });
  it("turns a negated positive word around instead of calling it joyful", () => {
    const bad = one("Sayangnya percobaan kami tidak berhasil.");
    expect(bad.emotion).toBe("serious");
    expect(one("Percobaan kami tidak berhasil sama sekali.").emotion).not.toBe("joyful");
    const good = one("Akhirnya kami berhasil!");
    expect(good.emotion).toBe("joyful");
  });
  it("tells reveal, risk, contrast, joy and reflection apart", () => {
    expect(one("Ternyata jawabannya cukup mengejutkan.")).toMatchObject({ emotion: "suspense", intonation: "suspense", pauseAfter: 0.5 });
    expect(one("Namun, ada risiko yang harus kita pahami.").emotion).toBe("serious");
    expect(one("Selamat, ini hasil yang luar biasa!").emotion).toBe("joyful");
    expect(one("Renungkan makna hidup dan bersyukurlah.")).toMatchObject({ emotion: "reflective", pace: "slow", delivery: "gentle" });
  });
  it("a reveal that ends on a colon or ellipsis gets the longest pause", () => {
    expect(one("Ternyata semuanya berawal dari satu hal...").pauseAfter).toBe(0.8);
    expect(one("Faktanya begini:").pauseAfter).toBe(0.8);
  });
  it("is honest about weak evidence", () => {
    const generic = one("Hari ini kita belajar sesuatu.");
    expect(generic).toMatchObject({ emotion: "warm", confidence: "low" });
    expect(generic.reason).toMatch(/informatif/);
    expect(one("Selamat datang, teman-teman.", "first").emotion).toBe("warm");
  });
  it("flags a sentence with two competing signals instead of pretending", () => {
    const d = one("Pernahkah kamu merasa bahaya itu sudah dekat?");
    expect(d.confidence).not.toBe("high");
    expect(d.reason).toMatch(/sinyal lain|kalimat tanya/);
  });
  it("calls figure-heavy fragments neutral, and slows them down for clarity", () => {
    const d = one("1.300 pengguna aktif, 25% naik, 3 kota.");
    expect(d.emotion).toBe("neutral");
    expect(d.pace).toBe("slow");
  });
});

describe("delivery, pace and pause", () => {
  it("shapes delivery from the sentence", () => {
    expect(one("Jangan menyerah sekarang!").delivery).toBe("emphatic");
    expect(one("Ibu berkata, \"Pulanglah sebelum gelap, Nak.\"").delivery).toBe("conversational");
    const long = "Karena banyak orang menunda pekerjaan penting sampai menit terakhir, mereka akhirnya bekerja terburu-buru, melakukan kesalahan kecil, dan merasa kelelahan sepanjang minggu.";
    expect(one(long).delivery).toBe("explanatory");
  });
  it("speeds up only short, cheerful or emphatic exclamations", () => {
    expect(one("Wow, keren banget!").pace).toBe("fast");
    expect(one("Hati-hati, ini berbahaya!").pace).not.toBe("fast");
    expect(one("Ayo mulai!").pace).toBe("fast");
    expect(one("Kita mulai pelan-pelan saja hari ini.").pace).toBe("normal");
  });
  it("a plain sentence adds no extra pause; the last line never does", () => {
    expect(one("Kita mulai dari yang paling mudah.").pauseAfter).toBe(0);
    expect(one("Ternyata jawabannya berbeda.", "last").pauseAfter).toBe(0);
    expect(one("Apa kabar?", "only").pauseAfter).toBe(0);
  });
  it("keeps the ending of the sentence in the intonation", () => {
    expect(one("Kita mulai dari sini,").intonation).toBe("steady");
    expect(one("Lalu apa yang terjadi...").intonation).toBe("suspense");
    expect(one("Itu saja untuk hari ini.").intonation).toBe("falling");
  });
});

describe("emphasis", () => {
  it("prefers figures, names and what an intensifier points at, and never stop words", () => {
    expect(emphasisWords("Harganya turun menjadi Rp50.000 untuk semua paket.")).toContain("Rp50.000");
    expect(emphasisWords("Ada 1.300 pengguna baru.")).toContain("1.300");
    expect(emphasisWords("Kami bertemu Pak Budi di Jakarta kemarin.")).toEqual(expect.arrayContaining(["Jakarta"]));
    expect(emphasisWords("Ini sangat penting untuk kita.")).toContain("penting");
    expect(emphasisWords("Dia tidak pernah menyerah.")).toEqual(["menyerah"]);
    for (const w of emphasisWords("Disiplin membuat langkah kecil menjadi berarti.")) expect(["membuat", "menjadi"]).not.toContain(w);
  });
  it("only ever names words that are in the sentence, at most two, in reading order", () => {
    const text = "Disiplin membuat langkah kecil menjadi berarti dalam 2025.";
    const e = emphasisWords(text);
    expect(e.length).toBeLessThanOrEqual(2);
    for (const w of e) expect(text.toLowerCase()).toContain(w.toLowerCase());
    expect(e.map(w => text.indexOf(w))).toEqual([...e.map(w => text.indexOf(w))].sort((a, b) => a - b));
  });
  it("cleans what the creator types and reports what it ignored", () => {
    expect(parseEmphasis("disiplin, berarti", "Disiplin membuat langkah kecil menjadi berarti.")).toEqual({ words: ["disiplin", "berarti"], ignored: [] });
    expect(parseEmphasis(" langkah ; langkah, hebat ,", "Disiplin membuat langkah kecil.")).toEqual({ words: ["langkah"], ignored: ["hebat"] });
    expect(parseEmphasis("a,b,c,d,e,f", "a b c d e f g").words).toHaveLength(4);
    expect(parseEmphasis("x".repeat(60), "x".repeat(60)).ignored).toHaveLength(1);
  });
});

describe("a corpus of real sentences never produces contradictions", () => {
  const corpus = [
    "Pernahkah kamu merasa waktu berjalan terlalu cepat?", "Ternyata, rahasia mereka sederhana banget.", "Namun, risikonya tidak bisa diabaikan.",
    "Hari ini kita belajar sesuatu yang baru.", "Selamat pagi semuanya! Semangat ya!", "Jangan lupa, bersyukur itu kunci hidup tenang.",
    "Dr. Budi tiba di Jakarta pada pukul 10.30, lalu bertemu 3 orang.", "Kami menaikkan harga 10% mulai 1 Januari 2026.", "Wow!", "Oke.",
    "Bayangkan jika semua itu hilang dalam sekejap...", "Kata ayah, \"Sabar, Nak, semua ada waktunya.\"", "Dll., dsb., yg lain pun sama.",
    "Apakah ini benar? Entahlah.", "Terima kasih sudah menonton, semoga bermanfaat.", "Faktanya, 7 dari 10 orang tidak sadar akan hal ini!",
    "", "   ", "...", "!!!", "😀😀", "Satu", "Tidak!", "Why does this happen?", "This is simply the best result we have ever had!",
    "Karena itu, sebelum memutuskan apa pun, pastikan kamu sudah membaca semua syarat, memahami risikonya, dan berbicara dengan orang yang berpengalaman di bidangnya.",
  ];
  const lang = (t: string) => (/[a-z]/i.test(t) && /\b(why|this|the)\b/i.test(t) ? "en" : "id") as "id" | "en";
  it("holds the invariants for every sentence at every position", () => {
    for (const t of corpus) for (const position of ["only", "first", "middle", "last"] as const) {
      const d = analyzeVoiceSegment(t, { lang: lang(t), position });
      const ctx = `${JSON.stringify(t)} @${position}`;
      expect(d.sourceText, ctx).toBe(t.trim());
      if (["reflective", "serious", "suspense"].includes(d.emotion)) expect(d.pace, ctx).not.toBe("fast");
      if (d.intonation === "rising") expect(d.emotion === "curious" || /\?$/.test(t.trim()) || d.reason.includes("tanya"), ctx).toBe(true);
      if (/\?\s*$/.test(t)) expect(d.intonation, ctx).toBe("rising");
      if (d.delivery === "emphatic") expect(/\?\s*$/.test(t), ctx).toBe(false);
      if (position === "last" || position === "only") expect(d.pauseAfter, ctx).toBe(0);
      expect([0, 0.25, 0.5, 0.8], ctx).toContain(d.pauseAfter);
      expect(d.emphasis.length, ctx).toBeLessThanOrEqual(2);
      for (const w of d.emphasis) expect(t.toLowerCase(), ctx).toContain(w.toLowerCase());
      expect(d.reason.length, ctx).toBeGreaterThan(0);
    }
  });
  it("is deterministic and does not touch its input", () => {
    const frozen = Object.freeze([...corpus]) as string[];
    expect(analyzeVoiceScript(frozen)).toEqual(analyzeVoiceScript([...corpus]));
  });
  it("English text uses punctuation and structure only, and says so", () => {
    const q = analyzeVoiceSegment("Why does this happen?", { lang: "en" });
    expect(q).toMatchObject({ emotion: "curious", intonation: "rising" });
    expect(q.reason).toMatch(/Bahasa Inggris/);
    expect(analyzeVoiceSegment("Hari ini ternyata seru banget!", { lang: "en" }).emotion).not.toBe("joyful");
  });
});

describe("overrides follow the sentence", () => {
  const script = ["Satu kalimat awal.", "Ternyata ini penting.", "Kalimat penutup."];
  const auto = () => analyzeVoiceScript(script);
  it("keys a segment by its text and which occurrence it is", () => {
    expect(segmentKeys(["Halo.", "Halo.", " halo. "])).toEqual(["halo.#1", "halo.#2", "halo.#3"]);
  });
  it("an override stays with its sentence when another sentence is inserted before it, or the order changes", () => {
    const overrides = { [segmentKeys(script)[1]]: { pace: "slow" as const, pauseAfter: 0 as const } };
    const inserted = ["Kalimat baru di depan.", ...script];
    const out = applyOverrides(analyzeVoiceScript(inserted), segmentKeys(inserted), overrides);
    expect(out.map(d => d.pace)).toEqual(["normal", "normal", "slow", "normal"]);
    expect(out[2].pauseAfter).toBe(0); // 0 is a real choice, not "unset"
    const swapped = [script[1], script[0], script[2]];
    expect(applyOverrides(analyzeVoiceScript(swapped), segmentKeys(swapped), overrides)[0].pace).toBe("slow");
  });
  it("editing a sentence drops its override; undoing the edit brings it back", () => {
    const overrides = { [segmentKeys(script)[1]]: { emotion: "joyful" as const } };
    const edited = [script[0], "Ternyata ini sangat penting.", script[2]];
    expect(applyOverrides(analyzeVoiceScript(edited), segmentKeys(edited), overrides)[1].emotion).toBe("suspense");
    expect(applyOverrides(auto(), segmentKeys(script), overrides)[1].emotion).toBe("joyful");
  });
  it("identical sentences are overridden one at a time", () => {
    const twice = ["Sama saja.", "Sama saja."];
    const out = applyOverrides(analyzeVoiceScript(twice), segmentKeys(twice), { [segmentKeys(twice)[1]]: { pace: "fast" } });
    expect(out.map(d => d.pace)).toEqual(["normal", "fast"]);
  });
  it("reads only the fields it knows from an override", () => {
    const out = applyOverrides(auto(), segmentKeys(script), { [segmentKeys(script)[0]]: { sourceText: "x", reason: "y", pace: "slow" } as never });
    expect(out[0].sourceText).toBe(script[0]);
    expect(out[0].reason).not.toBe("y");
    expect(out[0].pace).toBe("slow");
  });
});

describe("what is audible", () => {
  it("states honestly which controls change the audio", () => {
    expect(AUDIBLE).toEqual({ pace: true, pauseAfter: true, emotion: false, delivery: false, intonation: "partial", emphasis: false });
  });
  const base = (): VoiceDirection[] => analyzeVoiceScript(["Satu dua tiga.", "Ternyata empat lima."]);
  const key = (d: VoiceDirection[], speed = 1.05) => narrationKey({ texts: ["Satu dua tiga.", "Ternyata empat lima."], pauses: [0, 0] }, "id", 0, speed, d);
  it("a narration stays valid when only guidance changes, and goes stale when the sound would change", () => {
    const a = base();
    const guidance = a.map(d => ({ ...d, emotion: "joyful" as const, delivery: "gentle" as const, intonation: "steady" as const, emphasis: ["x"] }));
    expect(key(guidance)).toBe(key(a));
    expect(key(a.map((d, i) => (i === 1 ? { ...d, pace: "fast" as const } : d)))).not.toBe(key(a));
    expect(key(a.map((d, i) => (i === 0 ? { ...d, pauseAfter: 0.8 as const } : d)))).not.toBe(key(a));
    expect(key(a, 1.2)).not.toBe(key(a));
    expect(audibleKey(a[0])).toBe(`${a[0].pace}|${a[0].pauseAfter}|.`);
    expect(audibleKey({ ...a[0], intonation: "rising" })).toBe(`${a[0].pace}|${a[0].pauseAfter}|?`);
    // Falling, steady and suspense sound the same (no final question mark), so switching between them keeps a narration valid.
    expect(key(a.map(d => ({ ...d, intonation: "steady" as const })))).toBe(key(a.map(d => ({ ...d, intonation: "suspense" as const }))));
    expect(key(a.map((d, i) => (i === 0 ? { ...d, intonation: "rising" as const } : d)))).not.toBe(key(a));
  });
  it("the key depends on the sentences, their order, language and voice", () => {
    const d = base();
    const k = (texts: string[], lang = "id", voice = 0) => narrationKey({ texts, pauses: [0, 0] }, lang, voice, 1.05, d);
    expect(k(["a", "b"])).not.toBe(k(["b", "a"]));
    expect(k(["a", "b"])).not.toBe(k(["a", "b"], "en"));
    expect(k(["a", "b"])).not.toBe(k(["a", "b"], "id", 5));
  });
  it("a [jeda] pause and a directed pause overlap instead of adding up", () => {
    const d = { ...base()[0], pauseAfter: 0.5 as const };
    expect(scenePause(0, d)).toBe(0.5);
    expect(scenePause(2, d)).toBe(2);
    expect(scenePause(0.25, d)).toBe(0.5);
    expect(scenePause(1, undefined)).toBe(1);
  });
  it("pace maps to bounded synthesis speeds for every speed the app offers", () => {
    expect(paceToSpeed("slow", 1.05)).toBe(0.95);
    expect(paceToSpeed("normal", 1.05)).toBe(1.05);
    expect(paceToSpeed("fast", 1.05)).toBe(1.16);
    for (const s of SPEEDS) for (const p of ["slow", "normal", "fast"] as const) {
      const v = paceToSpeed(p, s.id);
      expect(v).toBeGreaterThanOrEqual(0.75); expect(v).toBeLessThanOrEqual(1.35);
    }
    expect(paceToSpeed("slow", 1.05)).toBeLessThan(paceToSpeed("normal", 1.05));
    expect(paceToSpeed("normal", 1.05)).toBeLessThan(paceToSpeed("fast", 1.05));
  });
});

describe("the one intonation control that reaches the audio: the final mark the engine reads", () => {
  const rising = { intonation: "rising" as const }, falling = { intonation: "falling" as const };
  it("a rising sentence ends in a question mark, and a statement never does", () => {
    expect(spokenForDirection("Tahukah kamu apa yang terjadi.", rising)).toBe("Tahukah kamu apa yang terjadi?");
    expect(spokenForDirection("Tahukah kamu apa yang terjadi", rising)).toBe("Tahukah kamu apa yang terjadi?");
    expect(spokenForDirection("Benar begitu...", rising)).toBe("Benar begitu?");
    expect(spokenForDirection("Sudah makan?", rising)).toBe("Sudah makan?");
    expect(spokenForDirection("Sudah makan?", falling)).toBe("Sudah makan.");
    expect(spokenForDirection("Sudah makan??", { intonation: "steady" })).toBe("Sudah makan.");
    expect(spokenForDirection("Kita mulai.", falling)).toBe("Kita mulai.");
  });
  it("keeps closing quotes and brackets in place, and leaves odd input alone", () => {
    expect(spokenForDirection("Katanya \"sudah selesai.\"", rising)).toBe("Katanya \"sudah selesai?\"");
    expect(spokenForDirection("(benarkah itu.)", rising)).toBe("(benarkah itu?)");
    expect(spokenForDirection("", rising)).toBe("");
    expect(spokenForDirection("   ", falling)).toBe("   ");
  });
  it("is what the analysis recommends: an opening question word without the mark is spoken as a question", () => {
    const d = analyzeVoiceSegment("Tahukah kamu apa yang terjadi");
    expect(spokenForDirection("Tahukah kamu apa yang terjadi.", d)).toBe("Tahukah kamu apa yang terjadi?");
    const statement = analyzeVoiceSegment("Saya tahu apa yang kamu rasakan.");
    expect(spokenForDirection("Saya tahu apa yang kamu rasakan.", statement)).toBe("Saya tahu apa yang kamu rasakan.");
  });
});
