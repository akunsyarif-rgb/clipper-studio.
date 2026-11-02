import { beforeEach } from "vitest";
import { resetAiGuards } from "./lib/gemini";

// The AI call cache / rate window is module-level state; every test starts clean.
beforeEach(() => resetAiGuards());
