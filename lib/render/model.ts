import { z } from "zod";

// The structured resume stored in documents.content. Titles, employers, dates,
// education and certifications are NOT stored here: they're printed from the
// vault at render time, never from AI text.

export const aiCheckSchema = z.object({ ok: z.boolean(), issue: z.string().nullable() });

export const resumeBulletSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(600),
  fact_ids: z.array(z.string()),
  requirement_codes: z.array(z.string()),
  relevance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  included: z.boolean(),
  reviewed: z.boolean(),
  ai_check: aiCheckSchema.nullable(),
});

export const resumeSummarySchema = z.object({
  text: z.string().min(1).max(800),
  fact_ids: z.array(z.string()),
  reviewed: z.boolean(),
  ai_check: aiCheckSchema.nullable(),
});

export const resumeSkillSchema = z.object({
  text: z.string().min(1).max(120),
  fact_ids: z.array(z.string()),
  included: z.boolean(),
});

export const resumeContentSchema = z.object({
  summary: resumeSummarySchema.nullable(),
  jobs: z.array(z.object({ job_id: z.string(), bullets: z.array(resumeBulletSchema) })),
  skills: z.array(resumeSkillSchema),
});

export type AiCheck = z.infer<typeof aiCheckSchema>;
export type ResumeBullet = z.infer<typeof resumeBulletSchema>;
export type ResumeSummary = z.infer<typeof resumeSummarySchema>;
export type ResumeSkill = z.infer<typeof resumeSkillSchema>;
export type ResumeContent = z.infer<typeof resumeContentSchema>;
