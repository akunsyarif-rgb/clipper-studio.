import { describe, expect, it } from "vitest";
import { ambiguousMask, isCallToAction } from "./sense";
import { detectVisual, matchConcept, sceneTopics } from "./visuals";
import { overlayKeyword } from "./overlay";

const tokens = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, "").split(/\s+/).filter(Boolean);
const masked = (s: string) => [...ambiguousMask(tokens(s))].map(i => tokens(s)[i]);
const look = (t: string, topics?: ReadonlySet<string>) => { const v = detectVisual(t, topics); return { template: v.template, icon: v.icon, keyword: overlayKeyword(t, v), cta: v.cta }; };

describe("the word 'like'", () => {
  it("is the verb (an icon may show) after a subject, an auxiliary or before 'to'", () => {
    for (const s of ["I like this idea", "You'll like it", "We would like to help", "They don't like waiting", "People really like short videos", "Do you like coffee"]) expect(masked(s)).toEqual([]);
  });
  it("is ignored as a comparison or filler", () => {
    for (const s of ["It looks like a good plan", "Just like that it works", "Something like this", "So like I was thinking", "Feels like home", "It works like magic", "Like a boss"]) expect(masked(s)).toContain("like");
  });
  it("is not a call to action in ordinary speech", () => {
    for (const s of ["I really like this idea.", "Do you like coffee?", "You will like it.", "It looks like rain."]) expect(look(s).template).not.toBe("cta");
  });
  it("is a call to action only when it asks the viewer to like", () => {
    for (const s of ["Please like and subscribe.", "Hit the like button.", "Smash that like", "Like this video if it helped.", "Don't forget to like, comment and share."]) expect(look(s).cta, s).toBeTruthy();
  });
});

describe("good", () => {
  it("is no longer an icon trigger on its own", () => {
    expect(look("This is good news for everyone.").icon).toBeNull();
    expect(look("Have a good day.").icon).toBeNull();
  });
  it("names the greeting for 'good morning' and 'good night', as a phrase", () => {
    expect(look("Good morning everyone, welcome back.")).toMatchObject({ icon: "morning", keyword: "GOOD MORNING" });
    expect(look("Good night, sleep well.")).toMatchObject({ icon: "sleep", keyword: "GOOD NIGHT" });
    expect(look("Selamat pagi semuanya.").icon).toBe("morning");
  });
  it("is praise in 'good job', 'great job' and 'well done'", () => {
    for (const s of ["Good job, team!", "Great job today.", "Well done everyone."]) expect(look(s).icon, s).toBe("like");
    expect(look("Good job, team!").keyword).toBe("GOOD JOB");
  });
});

describe("a content noun beats the generic verb", () => {
  it("shows coffee for 'Do you like coffee?' and the idea for 'I really like this idea.'", () => {
    expect(look("Do you like coffee?").icon).toBe("coffee");
    expect(look("I really like this idea.").icon).toBe("idea");
  });
  it("still shows the thumbs-up when 'like' is all there is", () => {
    expect(look("You'll like this one.").icon).toBe("like");
  });
});

describe("saving, trying and following", () => {
  it("'save money' is about thrift, 'save this video' asks to save", () => {
    expect(look("Save money every month.")).toMatchObject({ template: "statement", icon: "wallet" });
    expect(look("Save this video for later.").cta).toBe("SAVE");
  });
  it("'try to' is not an invitation, 'try it now' is", () => {
    expect(look("I try to be better every day.").cta).toBeUndefined();
    expect(look("Try it now for free.").cta).toBe("TRY");
  });
  it("'follow these steps' is an instruction, 'follow me' is an invitation", () => {
    expect(look("We follow these steps carefully.").cta).toBeUndefined();
    expect(look("Follow me for more.").cta).toBe("FOLLOW");
    expect(look("Follow untuk tips berikutnya!").cta).toBe("FOLLOW");
  });
  it("'dan' works like 'and' after a call to action", () => {
    expect(look("Jangan lupa follow dan simpan ya.").cta).toBe("FOLLOW");
    expect(look("Share dan komentar di bawah.").cta).toBe("SHARE");
  });
  it("Indonesian forms keep working and 'coba' alone is not a button", () => {
    expect(look("Coba bayangkan hasilnya.").cta).toBeUndefined();
    expect(look("Coba sekarang, gratis.").cta).toBe("COBA");
    expect(look("Simpan uang setiap bulan.").cta).toBeUndefined();
    expect(look("Simpan video ini untuk nanti.").cta).toBe("SIMPAN");
  });
  it("isCallToAction judges by what surrounds the word", () => {
    expect(isCallToAction("share", "", " this with a friend")).toBe(true);
    expect(isCallToAction("share", "I want to ", " the results with you")).toBe(false);
    expect(isCallToAction("order", "in ", " to win")).toBe(false);
    expect(isCallToAction("visit", "", " our website")).toBe(true);
    expect(isCallToAction("visit", "", " Bali next year")).toBe(false);
    expect(isCallToAction("download", "", " the app")).toBe(true);
  });
});

describe("generic words need the surrounding script", () => {
  it("stay silent on their own", () => {
    expect(matchConcept("Let's move on.")).toBeNull();
    expect(matchConcept("I can see it.")).toBeNull();
    expect(look("Have a nice day.").icon).toBeNull();
  });
  it("count when the neighbouring scenes are about the same thing", () => {
    const texts = ["Take one step at a time.", "Small steps add up.", "Let's move on."];
    const topics = sceneTopics(texts);
    expect(matchConcept(texts[2], topics[2])?.id).toBe("step");
    expect(matchConcept(texts[2], new Set(["money"]))).toBeNull();
  });
  it("sceneTopics looks two scenes either side and never counts the scene itself", () => {
    const topics = sceneTopics(["Uang itu penting.", "Waktu itu berharga.", "Ya begitulah.", "Mulai sekarang.", "Terakhir.", "Selesai."]);
    expect(topics[0].has("money")).toBe(false);
    expect(topics[2].has("money")).toBe(true);
    expect(topics[2].has("time")).toBe(true);
    expect(topics[5].has("money")).toBe(false);
  });
});

describe("overlayKeyword features the whole phrase", () => {
  it("joins neighbouring emphasised words, up to three, and stops at punctuation", () => {
    expect(overlayKeyword("Good morning everyone", { emphasis: ["good", "morning"] })).toBe("GOOD MORNING");
    expect(overlayKeyword("Very good, morning people", { emphasis: ["good", "morning"] })).toBe("GOOD");
    expect(overlayKeyword("a b c d", { emphasis: ["a", "b", "c", "d"] })).toBe("A B C");
  });
});
