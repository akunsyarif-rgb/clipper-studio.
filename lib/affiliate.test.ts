import { describe, expect, it } from "vitest";
import { affiliatePrompt, checkClaims, EMPTY_BRIEF, numberValue, parseAffiliate, parseBenefits, productWords, removeLine, scenesForProductPhoto, validateBrief, writeAffiliateScript, type AffiliateBrief } from "./affiliate";

const brief: AffiliateBrief = {
  ...EMPTY_BRIEF, product: "Botol Minum Termos Aqualux 750 ml", price: "Rp 89.000", promo: "Diskon 10% sampai akhir bulan", platform: "tiktok",
  benefits: ["Menjaga air tetap dingin 12 jam", "Bahan stainless steel anti karat", "Muat 750 ml, cukup untuk sehari"], audience: "pekerja kantoran", tone: "santai",
};
const gem = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const kinds = (lines: string[], b = brief) => checkClaims(lines, b).map(f => f.kind);

describe("the brief", () => {
  it("reads one benefit per line, with or without bullets, at most five", () => {
    expect(parseBenefits("- Tahan lama\n• Ringan\n1. Murah\n\n  Mudah   dibersihkan \na\nb\nc")).toEqual(["Tahan lama", "Ringan", "Murah", "Mudah dibersihkan", "a"]);
  });
  it("needs a product and at least one fact, within sensible lengths", () => {
    expect(validateBrief(brief)).toBeNull();
    expect(validateBrief({ ...brief, product: " " })).toMatch(/nama produk/);
    expect(validateBrief({ ...brief, benefits: [] })).toMatch(/minimal satu/);
    expect(validateBrief({ ...brief, benefits: ["x".repeat(121)] })).toMatch(/terlalu panjang/);
    expect(validateBrief({ ...brief, promo: "x".repeat(81) })).toMatch(/terlalu panjang/);
  });
});

describe("affiliatePrompt", () => {
  it("allows only the typed facts, forbids invented claims, and names the platform's call to action", () => {
    const p = affiliatePrompt(brief);
    expect(p).toContain("HANYA dari DATA PRODUK");
    expect(p).toContain("Jangan menambah fakta");
    expect(p).toContain("Cek keranjang kuning");
    expect(p).toContain('"harga":"Rp 89.000"');
    expect(p).toContain("Menjaga air tetap dingin 12 jam");
    expect(p).toContain("jangan \"terbaik/nomor 1/paling\"");
  });
  it("leaves out price and promo that were not given, so the model has nothing to invent from", () => {
    const p = affiliatePrompt({ ...brief, price: "", promo: "" });
    expect(p).not.toContain('"harga"');
    expect(p).not.toContain('"promo"');
  });
  it("carries the creator's feedback", () => {
    expect(affiliatePrompt(brief, "lebih singkat")).toContain("lebih singkat");
  });
});

describe("parseAffiliate", () => {
  it("reads title and lines, cleaning bullets and markdown", () => {
    const r = parseAffiliate(gem({ title: " Botol *Dingin* ", lines: ["1. Capek air cepat hangat?", "- **Termos** ini jaga dingin 12 jam.", "", "Cek keranjang kuning."] }));
    expect(r.lines).toEqual(["Capek air cepat hangat?", "Termos ini jaga dingin 12 jam.", "Cek keranjang kuning."]);
    expect(r.title).toBe("Botol *Dingin*");
  });
  it("accepts a bare array, a script string, and an OpenRouter-style answer in a code fence", () => {
    expect(parseAffiliate(gem(["Satu.", "Dua."])).lines).toEqual(["Satu.", "Dua."]);
    expect(parseAffiliate(gem({ script: "Satu.\nDua.\nTiga." })).lines).toHaveLength(3);
    const body = "```json\n" + JSON.stringify({ title: "T", lines: ["A kalimat.", "B kalimat."] }) + "\n```";
    expect(parseAffiliate({ choices: [{ message: { content: body } }] }).lines).toEqual(["A kalimat.", "B kalimat."]);
  });
  it("rejects an answer without a usable script", () => {
    expect(() => parseAffiliate(gem({ nope: 1 }))).toThrow(/naskah/);
    expect(() => parseAffiliate(gem({ lines: ["Cuma satu."] }))).toThrow(/terlalu pendek/);
  });
  it("caps the number and length of lines", () => {
    const r = parseAffiliate(gem({ lines: Array.from({ length: 30 }, (_, i) => "Kalimat " + i + " " + "x".repeat(300)) }));
    expect(r.lines).toHaveLength(14);
    expect(r.lines.every(l => l.length <= 200)).toBe(true);
  });
});

describe("writeAffiliateScript", () => {
  const opts = (fetchImpl: typeof fetch) => ({ apiKey: "k".repeat(30), model: "m", language: "id", fetchImpl, retryDelaysMs: [] });
  it("sends one request with the facts and never the key", async () => {
    let sent = "";
    const fetchImpl = (async (_u: string, init: { body: string }) => { sent = init.body; return new Response(JSON.stringify(gem({ title: "T", lines: ["Satu kalimat.", "Dua kalimat."] })), { status: 200 }); }) as unknown as typeof fetch;
    const r = await writeAffiliateScript(brief, opts(fetchImpl), "lebih singkat");
    expect(r.lines).toHaveLength(2);
    expect(sent).toContain("Botol Minum Termos Aqualux");
    expect(sent).toContain("lebih singkat");
    expect(sent).not.toContain("k".repeat(30));
  });
  it("refuses an incomplete brief without calling the service", async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch;
    await expect(writeAffiliateScript({ ...brief, benefits: [] }, opts(fetchImpl))).rejects.toThrow(/minimal satu/);
    expect(called).toBe(false);
  });
});

describe("numbers", () => {
  it("reads Indonesian number formats", () => {
    expect(numberValue("89.000")).toBe(89000);
    expect(numberValue("4,5")).toBe(4.5);
    expect(numberValue("89", "ribu")).toBe(89000);
    expect(numberValue("1,5", "juta")).toBe(1_500_000);
    expect(numberValue("3.5")).toBe(3.5);
  });
});

describe("checkClaims", () => {
  it("passes a script that only says what the data says", () => {
    const lines = ["Air cepat hangat saat kerja?", "Termos Aqualux menjaga air tetap dingin 12 jam.", "Bahan stainless steel anti karat, muat 750 ml.", "Harganya Rp 89.000, diskon 10% sampai akhir bulan.", "Cek keranjang kuning."];
    expect(checkClaims(lines, brief)).toEqual([]);
  });
  it("accepts the same price written another way", () => {
    expect(kinds(["Cuma 89 ribu saja."])).toEqual([]);
    expect(kinds(["Cuma Rp89.000 saja."])).toEqual([]);
  });
  it("flags health and beauty claims, and the creator's data cannot clear them", () => {
    expect(kinds(["Menyembuhkan jerawat dalam semalam."])).toContain("kesehatan");
    expect(kinds(["Menyembuhkan jerawat."], { ...brief, benefits: [...brief.benefits, "Menyembuhkan jerawat"] })).toContain("kesehatan");
    expect(kinds(["Bantu turun 5 kg dan detox badan."])).toContain("kesehatan");
  });
  it("flags superlatives, guarantees, scarcity, social proof, comparisons and certificates not in the data", () => {
    expect(kinds(["Termos terbaik, nomor 1 di Indonesia."])).toContain("superlatif");
    expect(kinds(["Dijamin awet, garansi uang kembali."])).toContain("jaminan");
    expect(kinds(["Stok terbatas, tinggal 3 lagi!"])).toContain("terbatas");
    expect(kinds(["Sudah terjual ribuan, viral di mana-mana."])).toContain("bukti");
    expect(kinds(["Lebih baik dari merek lain."])).toContain("perbandingan");
    expect(kinds(["Bersertifikat BPOM dan halal."])).toContain("izin");
    expect(kinds(["Ada bonus gratis ongkir lho."])).toContain("promo");
  });
  it("clears a phrase the creator's own data contains", () => {
    expect(kinds(["Garansi 1 tahun dari toko."], { ...brief, benefits: [...brief.benefits, "Garansi 1 tahun dari toko"] })).not.toContain("jaminan");
    expect(kinds(["Gratis ongkir ke seluruh Indonesia."], { ...brief, promo: "Gratis ongkir" })).toEqual([]);
  });
  it("flags numbers that are not in the data, but not small plain counts", () => {
    expect(kinds(["Diskon 50% hari ini."])).toContain("angka");
    expect(checkClaims(["Harganya cuma Rp 59.000."], brief).map(f => f.match)).toEqual(["59.000"]);
    expect(kinds(["Ada 3 alasan kamu butuh ini."])).toEqual([]);
    expect(kinds(["Hasilnya terlihat dalam 3 hari."])).toContain("angka");
  });
  it("reports once per phrase and sorts by line, pointing at the sentence", () => {
    const f = checkClaims(["Aman.", "Dijamin 100% ampuh!", "Biasa saja."], brief);
    expect(f.every(x => x.line === 1)).toBe(true);
    expect(f.map(x => x.match.toLowerCase()).sort()).toEqual(["100%", "ampuh", "dijamin"]);
    expect(f[0].text).toBe("Dijamin 100% ampuh!");
  });
  it("ignores the *emphasis* marks the script uses and empty lines", () => {
    expect(kinds(["Ini *terbaik* sekali.", ""])).toEqual(["superlatif"]);
  });
});

describe("the product photo", () => {
  it("knows the product's words", () => {
    expect(productWords("Botol Minum Termos Aqualux 750 ml")).toEqual(["botol", "minum", "termos", "aqualux"]);
  });
  it("picks the scenes that name the product, plus the last one", () => {
    const texts = ["Capek air cepat hangat?", "Termos Aqualux menjaga dingin.", "Muat banyak.", "Cek keranjang kuning."];
    expect(scenesForProductPhoto(texts, brief.product)).toEqual([1, 3]);
    expect(scenesForProductPhoto([], brief.product)).toEqual([]);
  });
});

describe("removeLine", () => {
  it("drops one line of the script", () => {
    expect(removeLine("a\nb\nc", 1)).toBe("a\nc");
    expect(removeLine("a\r\nb", 0)).toBe("b");
  });
});
