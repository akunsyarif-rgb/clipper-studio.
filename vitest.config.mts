import { defineConfig } from "vitest/config";

// tsconfig keeps `jsx: preserve` for Next.js; tests that render a Remotion component to markup need JSX compiled.
export default defineConfig({ oxc: { jsx: { runtime: "automatic" } } });
