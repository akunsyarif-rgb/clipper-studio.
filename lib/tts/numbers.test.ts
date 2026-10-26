import { describe, expect, it } from "vitest";
import { splitScript, splitSentences } from "../script";
import { intToWords, parseNumberToken, spokenText } from "./numbers";

describe("intToWords", () => {
  it.each([
    [0, "nol"], [1, "satu"], [10, "sepuluh"], [11, "sebelas"], [12, "dua belas"], [19, "sembilan belas"], [20, "dua puluh"], [45, "empat puluh lima"],
    [100, "seratus"], [101, "seratus satu"], [111, "seratus sebelas"], [200, "dua ratus"], [700, "tujuh ratus"],
    [1000, "seribu"], [1300, "seribu tiga ratus"], [1945, "seribu sembilan ratus empat puluh lima"], [2000, "dua ribu"],
    [17000, "tujuh belas ribu"], [100000, "seratus ribu"], [1000000, "satu juta"], [2500000, "dua juta lima ratus ribu"],
    [1000000000, "satu miliar"], [3000000000000, "tiga triliun"],
  ])("id %i → %s", (n, words) => expect(intToWords(n, "id")).toBe(words));

  it.each([
    [0, "zero"], [7, "seven"], [13, "thirteen"], [21, "twenty one"], [100, "one hundred"], [305, "three hundred five"],
    [1000, "one thousand"], [1300, "one thousand three hundred"], [17000, "seventeen thousand"], [2024, "two thousand twenty four"],
    [1000000, "one million"], [2500000, "two million five hundred thousand"],
  ])("en %i → %s", (n, words) => expect(intToWords(n, "en")).toBe(words));

  it("rejects negatives and fractions; reads huge values digit by digit", () => {
    expect(() => intToWords(-1, "id")).toThrow();
    expect(() => intToWords(1.5, "en")).toThrow();
    expect(intToWords(1e15, "en")).toBe("one zero zero zero zero zero zero zero zero zero zero zero zero zero zero zero");
  });
});

describe("parseNumberToken", () => {
  it.each([
    ["17.000", "id", "17000", ""], ["1.300", "id", "1300", ""], ["1.234.567", "id", "1234567", ""], ["1.234,5", "id", "1234", "5"],
    ["4,5", "id", "4", "5"], ["3.5", "id", "3", "5"], ["0.500", "id", "0", "500"], ["12", "id", "12", ""],
    ["1,300", "en", "1300", ""], ["17,000", "en", "17000", ""], ["1,234.56", "en", "1234", "56"], ["3.5", "en", "3", "5"], ["1,234,567", "en", "1234567", ""],
  ] as const)("%s (%s)", (raw, lang, integer, fraction) => expect(parseNumberToken(raw, lang)).toEqual({ integer, fraction }));
});

describe("spokenText", () => {
  it("reads Indonesian grouped numbers as whole numbers (not '1' and '300')", () => {
    expect(spokenText("Ada lebih dari 17.000 pulau.", "id")).toBe("Ada lebih dari tujuh belas ribu pulau.");
    expect(spokenText("Ada lebih dari 1.300 suku dan 700 bahasa daerah.", "id")).toBe("Ada lebih dari seribu tiga ratus suku dan tujuh ratus bahasa daerah.");
    expect(spokenText("Merdeka pada tahun 1945.", "id")).toBe("Merdeka pada tahun seribu sembilan ratus empat puluh lima.");
  });
  it("percent, multiplier, decimals, money and suffixes", () => {
    expect(spokenText("80% kreator menyerah.", "id")).toBe("delapan puluh persen kreator menyerah.");
    expect(spokenText("Naik 3x lipat.", "id")).toBe("Naik tiga kali lipat.");
    expect(spokenText("Rating 4,5 bintang.", "id")).toBe("Rating empat koma lima bintang.");
    expect(spokenText("Hemat Rp 50.000 setiap minggu.", "id")).toBe("Hemat lima puluh ribu rupiah setiap minggu.");
    expect(spokenText("Gaji Rp 5 jt per bulan.", "id")).toBe("Gaji lima juta rupiah per bulan.");
    expect(spokenText("Harga 10rb saja.", "id")).toBe("Harga sepuluh ribu saja.");
    expect(spokenText("Harga 10 rb saja.", "id")).toBe("Harga sepuluh ribu saja.");
  });
  it("English numbers", () => {
    expect(spokenText("It reaches 17,000 islands and 1,300 groups.", "en")).toBe("It reaches seventeen thousand islands and one thousand three hundred groups.");
    expect(spokenText("It saves $1,200 a year.", "en")).toBe("It saves one thousand two hundred dollars a year.");
    expect(spokenText("Only $1 today.", "en")).toBe("Only one dollar today.");
    expect(spokenText("Rated 3.5 stars, up 20%.", "en")).toBe("Rated three point five stars, up twenty percent.");
    expect(spokenText("Grew 3x in 2024.", "en")).toBe("Grew three times in two thousand twenty four.");
  });
  it("ranges, zero-padded numbers and text without digits", () => {
    expect(spokenText("Tahun 2020-2024.", "id")).toBe("Tahun dua ribu dua puluh sampai dua ribu dua puluh empat.");
    expect(spokenText("Call 0812.", "en")).toBe("Call zero eight one two.");
    expect(spokenText("Tidak ada angka di sini.", "id")).toBe("Tidak ada angka di sini.");
    expect(spokenText("Model COVID19 dan H2O.", "en")).toBe("Model COVID19 dan H2O.");
  });
});

describe("splitting scripts around numbers", () => {
  it("does not split a sentence at a thousands or decimal separator", () => {
    expect(splitSentences("Ada 17.000 pulau. Ada 1.300 suku.")).toEqual(["Ada 17.000 pulau.", " Ada 1.300 suku."]);
    expect(splitSentences("Nilainya 3.5 bintang!")).toEqual(["Nilainya 3.5 bintang!"]);
    expect(splitScript("Negeri ini berdiri di atas lebih dari 17.000 pulau.\nAda lebih dari 1.300 suku dan 700 bahasa.")).toEqual([
      "Negeri ini berdiri di atas lebih dari 17.000 pulau.", "Ada lebih dari 1.300 suku dan 700 bahasa.",
    ]);
  });
  it("still ends a sentence at a period after a number", () => {
    expect(splitSentences("Merdeka tahun 1945. Itu bersejarah.")).toEqual(["Merdeka tahun 1945.", " Itu bersejarah."]);
    expect(splitSentences('Dia berkata "pergi." Lalu diam.')).toEqual(['Dia berkata "pergi."', " Lalu diam."]);
  });
  it("does not end a sentence in the middle of a word like 'e.g.'", () => {
    expect(splitSentences("Gunakan app.example.com sekarang.")).toEqual(["Gunakan app.example.com sekarang."]);
  });
});
