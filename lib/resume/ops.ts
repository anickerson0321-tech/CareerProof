import { z } from "zod";
import { PAGE_TARGETS } from "@/lib/domain";
import { afterEdit, checkLine, type GuardFact } from "@/lib/guard/truth-guard";
import type { ResumeContent } from "@/lib/render/model";

// Changes a person can make to a generated resume. Shared by the browser
// (instant preview) and the server (the source of truth), so both apply
// exactly the same rules.

export const documentOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("edit"),
    bulletId: z.string().min(1).max(20),
    text: z.string().trim().min(3, "A line needs at least a few words.").max(600, "Keep each line under 600 characters."),
  }),
  z.object({ op: z.literal("include"), bulletId: z.string().min(1).max(20), included: z.boolean() }),
  z.object({ op: z.literal("review"), bulletId: z.string().min(1).max(20) }),
  z.object({
    op: z.literal("summary-edit"),
    text: z.string().trim().min(3, "The summary needs at least a few words.").max(800, "Keep the summary under 800 characters."),
  }),
  z.object({ op: z.literal("summary-review") }),
  z.object({ op: z.literal("skill-include"), index: z.number().int().min(0).max(50), included: z.boolean() }),
  /** One-tap removal of lines suggested by page fitting. */
  z.object({ op: z.literal("exclude-many"), bulletIds: z.array(z.string().min(1).max(20)).min(1).max(50) }),
  z.object({ op: z.literal("page-target"), pageTarget: z.enum(PAGE_TARGETS) }),
]);

export type DocumentOp = z.infer<typeof documentOpSchema>;

export class OpError extends Error {}

export function applyOp(content: ResumeContent, op: DocumentOp, facts: ReadonlyMap<string, GuardFact>): ResumeContent {
  const mapBullet = (id: string, fn: (b: ResumeContent["jobs"][number]["bullets"][number]) => ResumeContent["jobs"][number]["bullets"][number]) => {
    let found = false;
    const jobs = content.jobs.map((j) => ({
      ...j,
      bullets: j.bullets.map((b) => {
        if (b.id !== id) return b;
        found = true;
        return fn(b);
      }),
    }));
    if (!found) throw new OpError("That line wasn't found. Reload the page and try again.");
    return { ...content, jobs };
  };

  switch (op.op) {
    case "edit":
      // Editing clears the person's review and the old AI check (SPEC §8).
      return mapBullet(op.bulletId, (b) => afterEdit(b, op.text));
    case "include":
      return mapBullet(op.bulletId, (b) => ({ ...b, included: op.included }));
    case "review":
      return mapBullet(op.bulletId, (b) => {
        const result = checkLine(b, facts);
        if (result.flags.some((f) => f.level === "hard")) {
          throw new OpError("This line can't be marked accurate because it relies on a fact that isn't confirmed. Confirm the fact or edit the line.");
        }
        return { ...b, reviewed: true };
      });
    case "summary-edit":
      if (!content.summary) throw new OpError("There's no summary to edit.");
      return { ...content, summary: afterEdit(content.summary, op.text) };
    case "summary-review": {
      if (!content.summary) throw new OpError("There's no summary to review.");
      const result = checkLine(content.summary, facts);
      if (result.flags.some((f) => f.level === "hard")) {
        throw new OpError("The summary can't be marked accurate because it relies on a fact that isn't confirmed.");
      }
      return { ...content, summary: { ...content.summary, reviewed: true } };
    }
    case "skill-include": {
      if (!content.skills[op.index]) throw new OpError("That skill wasn't found.");
      return { ...content, skills: content.skills.map((s, i) => (i === op.index ? { ...s, included: op.included } : s)) };
    }
    case "exclude-many": {
      const ids = new Set(op.bulletIds);
      return { ...content, jobs: content.jobs.map((j) => ({ ...j, bullets: j.bullets.map((b) => (ids.has(b.id) ? { ...b, included: false } : b)) })) };
    }
    case "page-target":
      return content;
  }
}
