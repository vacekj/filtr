import { describe, expect, it } from "bun:test";
import { matchesKeywords } from "../src/lib/keywords";
import { DEFAULT_KEYWORDS, normalizeSettings } from "../src/lib/settings";

describe("default topic phrases", () => {
  it("matches Czech inflections and English phrases", () => {
    for (const text of [
      "Pravidla pro uprchlíky",
      "Téma imigrace",
      "Příběhy černochů v Evropě",
      "sexuální násilí",
      "Immigration news",
      "Macron met Le Pen today",
      "Projev Macrona",
      "Donald Trump signs order",
      "Mass deportations begin",
      "Deportace z USA",
      "Situace v Africe",
    ]) {
      expect(matchesKeywords(text, DEFAULT_KEYWORDS)).toBe(true);
    }
  });
  it("does not confuse Black people with colors, names or a band", () => {
    for (const text of [
      "Black Sabbath zahrají v Praze",
      "Ministryně Černochová představila rozpočet",
      "černá skříňka",
      "Migrace databáze",
      "Grapefruit and rapeseed oil",
      "Playing a trump card",
    ]) {
      expect(matchesKeywords(text, DEFAULT_KEYWORDS)).toBe(false);
    }
  });
  it("treats regex characters as literals and only expands a trailing star", () => {
    expect(matchesKeywords("plain text", ".*")).toBe(false);
    expect(matchesKeywords("C++ in Prague", "C++")).toBe(true);
  });
  it("restores defaults for a fresh install without enabling filtering", () => {
    const settings = normalizeSettings({});
    expect(settings.IS_ACTIVE).toBe(false);
    expect(settings.KEYWORDS).toBe(DEFAULT_KEYWORDS);
    expect(settings.HIDE_THRESHOLD).toBe(0.45);
  });
});
