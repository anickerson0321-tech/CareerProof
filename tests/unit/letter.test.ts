import { describe, expect, it } from "vitest";
import { deniseAfterAnswer } from "../support/fixture-application";
import { readFixture } from "../support/fixture-vault";
import { letterFacts, letterRequest, MAX_LETTER_MATCHES } from "@/lib/ai/tasks/cover-letter";
import { letterNumberNotes, wordCount } from "@/lib/letters/text";

const asOf = { year: 2026, month: 10 };
const { views, analysis, vault } = deniseAfterAnswer(asOf);

describe("cover letter input", () => {
  it("uses only confirmed facts behind strong or partial matches, required first", () => {
    const matches = letterFacts(views);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThanOrEqual(MAX_LETTER_MATCHES);
    for (const m of matches) {
      expect(m.facts.every((f) => f.status === "confirmed")).toBe(true);
      const view = views.find((v) => v.req.text === m.requirement)!;
      expect(["strong", "partial"]).toContain(view.status);
    }
    const kinds = matches.map((m) => views.find((v) => v.req.text === m.requirement)!);
    const firstPreferred = kinds.findIndex((v) => v.req.kind !== "required");
    if (firstPreferred >= 0) expect(kinds.slice(firstPreferred).every((v) => v.status !== "strong" || v.req.kind !== "required")).toBe(true);
  });

  it("leaves out unconfirmed facts", () => {
    const unconfirmed = views.map((v) => ({ ...v, evidence: v.evidence.map((f) => ({ ...f, status: "pending" as const })) }));
    expect(letterFacts(unconfirmed)).toEqual([]);
    expect(letterRequest({ name: "A", title: "T", employer: "", views: unconfirmed }).prompt).toContain("(none yet)");
  });

  it("has a recorded response for the E2E flow, with no unsupported numbers", () => {
    const request = letterRequest({ name: "Denise Okafor", title: analysis.title, employer: analysis.employer, views });
    const text = readFixture("ai", "cover_letter", `${request.fixtureKey}.txt`);
    expect(wordCount(text)).toBeGreaterThanOrEqual(230);
    expect(wordCount(text)).toBeLessThanOrEqual(320);
    expect(text.startsWith("Dear Hiring Manager,")).toBe(true);
    expect(letterNumberNotes(text, vault.facts)).toEqual([]);
  });
});

describe("letter helpers", () => {
  it("counts words", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("  one two\nthree  ")).toBe(3);
  });

  it("notes numbers no confirmed fact states", () => {
    const facts = vault.facts;
    const notes = letterNumberNotes("I led a crew of 6 and trained 12 new hires, cutting waste 37%.", facts);
    expect(notes.some((n) => n.includes('"12"'))).toBe(true);
    expect(notes.some((n) => n.includes('"37%"'))).toBe(true);
    expect(notes.some((n) => n.includes('"6"'))).toBe(false);
  });
});
