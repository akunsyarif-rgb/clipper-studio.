import { describe, expect, it } from "vitest";
import { captionsToTranscript, explainYoutube, lengthsMatch, mergeCaptionLines, parsePastedTranscript } from "./youtube";

describe("a transcript pasted from YouTube", () => {
  it("reads 'time, then text' pairs and ends each line where the next starts", () => {
    const l = parsePastedTranscript("Transkrip\nCari transkrip\n0:00\nHalo semuanya\n0:03\nselamat datang\ndi video ini\n1:05\nlanjut\n1:02:03\nsatu jam lebih");
    expect(l.map(x => [x.start, x.end, x.text])).toEqual([
      [0, 3, "Halo semuanya"], [3, 65, "selamat datang di video ini"], [65, 3723, "lanjut"], [3723, 3727, "satu jam lebih"],
    ]);
  });
  it("reads 'time text' on one line, and Windows line breaks", () => {
    const l = parsePastedTranscript("0:00 Halo\r\n0:04 dunia\r\n");
    expect(l.map(x => [x.start, x.text])).toEqual([[0, "Halo"], [4, "dunia"]]);
  });
  it("reads SRT and VTT, dropping cue numbers and tags", () => {
    const srt = "1\n00:00:01,000 --> 00:00:03,500\nHalo <i>dunia</i>\n\n2\n00:00:04,000 --> 00:00:06,000\nbaris dua\nlanjut\n";
    expect(parsePastedTranscript(srt).map(x => [x.start, x.end, x.text])).toEqual([[1, 3.5, "Halo dunia"], [4, 6, "baris dua lanjut"]]);
    const vtt = "WEBVTT\n\n00:01.000 --> 00:02.000\nsatu\n\n01:00.500 --> 01:02.000\ndua\n";
    expect(parsePastedTranscript(vtt).map(x => [x.start, x.text])).toEqual([[1, "satu"], [60.5, "dua"]]);
  });
  it("gives nothing for text with no times", () => {
    expect(parsePastedTranscript("hanya kalimat biasa\ntanpa waktu")).toEqual([]);
    expect(parsePastedTranscript("   ")).toEqual([]);
  });
});

describe("shaping captions into sentences", () => {
  const short = Array.from({ length: 10 }, (_, i) => ({ start: i * 3, end: i * 3 + 3, text: `k${i}` }));
  it("joins short lines up to about eight seconds and never over a long gap", () => {
    const m = mergeCaptionLines(short);
    expect(m.map(x => x.text)).toEqual(["k0 k1 k2", "k3 k4 k5", "k6 k7 k8", "k9"]);
    expect(m[0]).toMatchObject({ start: 0, end: 9 });
    const gap = mergeCaptionLines([{ start: 0, end: 2, text: "a" }, { start: 10, end: 12, text: "b" }]);
    expect(gap).toHaveLength(2);
  });
  it("makes a transcript that covers the video", () => {
    const t = captionsToTranscript(short, 60, "indonesian");
    expect(t.duration).toBe(60);
    expect(t.granularity).toBe("segment");
    expect(t.segments[0].words.length).toBe(3);
    expect(captionsToTranscript(short, 5, "indonesian").duration).toBe(30);
  });
});

describe("the wrong file", () => {
  it("accepts a file that is about as long as the video and refuses one that is not", () => {
    expect(lengthsMatch(1160, 1158)).toBe(true);
    expect(lengthsMatch(1100, 1158)).toBe(true);
    expect(lengthsMatch(600, 1158)).toBe(false);
    expect(lengthsMatch(100, 100)).toBe(true);
    expect(lengthsMatch(0, 100)).toBe(true);
    expect(lengthsMatch(120, 100)).toBe(false);
  });
});

describe("explaining why captions failed", () => {
  it("points to pasting the transcript when YouTube refuses the server", () => {
    expect(explainYoutube("BLOCKED", 502)).toMatchObject({ kind: "blocked", message: expect.stringContaining("Tempel transkripnya") });
    expect(explainYoutube("UNREACHABLE", 504).kind).toBe("blocked");
    expect(explainYoutube("NO_CAPTIONS", 404).kind).toBe("nocaptions");
    expect(explainYoutube("UNPLAYABLE", 404).kind).toBe("unavailable");
    expect(explainYoutube("BAD_URL", 400).kind).toBe("badurl");
    expect(explainYoutube("NOT_SIGNED_IN", 401).kind).toBe("signin");
    expect(explainYoutube("", 500).kind).toBe("server");
  });
});
