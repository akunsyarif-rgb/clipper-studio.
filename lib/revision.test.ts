import { describe, expect, it } from "vitest";
import type { DirectorPlan } from "./director";
import { describeScope, editableScenes, emptyHistory, parseScope, record, redo, restrictPlan, undo } from "./revision";

describe("parseScope", () => {
  it("reads named scenes, lists and ranges", () => {
    expect(parseScope("Buat scene 2 lebih dinamis", 5).scope).toEqual({ kind: "scenes", indices: [1] });
    expect(parseScope("scene 2 dan 4 lebih tenang", 5).scope).toEqual({ kind: "scenes", indices: [1, 3] });
    expect(parseScope("scene 2-4 pakai angka", 5).scope).toEqual({ kind: "scenes", indices: [1, 2, 3] });
  });
  it("reads first/last by meaning", () => {
    expect(parseScope("Buat ending lebih kuat", 5).scope).toEqual({ kind: "scenes", indices: [4] });
    expect(parseScope("pembuka lebih berani", 5).scope).toEqual({ kind: "scenes", indices: [0] });
  });
  it("defaults to the whole project and reports scenes that do not exist", () => {
    expect(parseScope("Ubah semua latar jadi biru tua", 5).scope).toEqual({ kind: "all" });
    expect(parseScope("lebih tenang", 5).scope).toEqual({ kind: "all" });
    expect(parseScope("scene 9 lebih kuat", 5)).toEqual({ scope: { kind: "all" }, outOfRange: [9] });
  });
});

describe("restrictPlan", () => {
  const plan: DirectorPlan = { style: "kinetic", palette: "gold", typography: "impact", backdrop: "mesh", note: "n", scenes: [{ template: "statement", reason: "a" }, { template: "list", reason: "b" }, { template: "cta", reason: "c" }] };
  it("drops scenes outside the scope and any global change when scoped", () => {
    const r = restrictPlan(plan, { kind: "scenes", indices: [1] });
    expect(r.plan.scenes).toEqual([undefined, plan.scenes[1], undefined]);
    expect(r.plan.style).toBeUndefined();
    expect(r.plan.typography).toBeUndefined();
    expect(r.plan.backdrop).toBeUndefined();
    expect(r.dropped).toEqual([0, 2]);
  });
  it("keeps locked scenes untouched even for a global revision", () => {
    const r = restrictPlan(plan, { kind: "all" }, new Set([0]));
    expect(r.plan.scenes[0]).toBeUndefined();
    expect(r.plan.style).toBe("kinetic");
    expect(editableScenes({ kind: "all" }, 3, new Set([0]))).toEqual([1, 2]);
  });
  it("describes the scope for the creator", () => {
    expect(describeScope({ kind: "scenes", indices: [1, 3] }, 5)).toBe("scene 2, 4");
  });
});

describe("history", () => {
  it("undoes and redoes in order and clears redo on a new revision", () => {
    let h = emptyHistory<string>();
    h = record(h, "r1", "v0");
    h = record(h, "r2", "v1");
    const u = undo(h, "v2")!;
    expect(u.state).toBe("v1");
    const r = redo(u.history, "v1")!;
    expect(r.state).toBe("v2");
    const u2 = undo(h, "v2")!;
    expect(record(u2.history, "r3", "v1").future).toEqual([]);
    expect(undo(emptyHistory<string>(), "x")).toBeNull();
  });
  it("keeps at most 20 versions", () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 30; i++) h = record(h, "r", i);
    expect(h.past).toHaveLength(20);
    expect(h.past[0].state).toBe(10);
  });
});
