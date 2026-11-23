/// <reference types="vite/client" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandLogo } from "../lib/brand";

/** Width and height from a PNG's header, so the test checks the declared size against the real file. */
function pngSize(file: string) {
  const b = readFileSync(new URL(`../public${file}`, import.meta.url));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe("the sidebar logo for each business", () => {
  it("gives Landscape, Construction and anything unknown the Quality First Turf logo", () => {
    for (const slug of ["quality-first-turf", "quality-first-turf-construction", "something-else"]) {
      expect(brandLogo(slug)).toEqual({ src: "/brand/logo-full.png", width: 39, height: 30 });
    }
  });

  it("gives Patios its own logo, at the size of the real file", () => {
    const logo = brandLogo("quality-first-patios");
    expect(logo.src).toBe("/brand/QFP-logo.png");
    expect(logo.height).toBe(30);
    const real = pngSize(logo.src);
    expect(Math.abs(logo.width / logo.height - real.w / real.h)).toBeLessThan(0.05);
  });
});
