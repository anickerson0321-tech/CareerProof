import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { cleanText } from "@/lib/extract/detect";
import { extractionRequest, postProcessExtraction } from "@/lib/ai/tasks/extract-resume";

// Real-model check of the extraction rules on the fixture resumes. The
// recorded fixtures were written to these same rules; this verifies the live
// model follows them too.

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
const resumes = join(__dirname, "..", "fixtures", "resumes");

describe.skipIf(!hasKey)("live: extract resume", () => {
  const provider = hasKey ? new AnthropicProvider() : null;

  it.each(["custodial-lead", "career-changer", "new-grad", "skills-table"])("%s follows the extraction rules", async (name) => {
    const text = cleanText(readFileSync(join(resumes, `${name}.txt`), "utf8"));
    const { data } = await provider!.structured(extractionRequest(text));
    const clean = postProcessExtraction(data);

    expect(clean.jobs.length).toBeGreaterThan(0);
    expect(clean.profile.name).toBeTruthy();
    for (const f of clean.facts) expect(f.text).not.toMatch(/@|\(\d{3}\)/);
    for (const s of clean.facts.filter((f) => f.type === "skill")) expect(s.jobKey).toBeNull();
    for (const e of clean.facts.filter((f) => f.type === "education")) {
      expect(e.text).toMatch(/Completed|In progress|not completed|Completion not stated/i);
    }
    // Every number in a fact must appear in the resume.
    for (const f of clean.facts) {
      for (const n of f.text.match(/\d[\d,.]*/g) ?? []) expect(text, `"${n}" in "${f.text}"`).toContain(n.replace(/[.,]$/, ""));
    }
  });

  it("career changer: the in-progress M.Ed. is never shown as completed", async () => {
    const text = cleanText(readFileSync(join(resumes, "career-changer.txt"), "utf8"));
    const { data } = await provider!.structured(extractionRequest(text));
    const med = postProcessExtraction(data).facts.find((f) => f.type === "education" && /M\.?Ed/i.test(f.text));
    expect(med?.text).toMatch(/in progress/i);
    expect(med?.text).not.toMatch(/\bcompleted\b(?! )/i);
  });
});
