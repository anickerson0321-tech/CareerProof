import { z } from "zod";

const optional = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? null : v));

/** Contact details shown on documents. Empty fields are saved as "not set". */
export const profileSchema = z.object({
  full_name: optional(120, "Keep your name under 120 characters."),
  email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || z.email().safeParse(v).success, "Enter an email address like name@example.com, or leave it blank.")
    .transform((v) => (v === "" ? null : v)),
  phone: optional(40, "Keep the phone number under 40 characters."),
  location: optional(120, "Keep the location under 120 characters."),
});

export type ProfileInput = z.input<typeof profileSchema>;

/** What the person types to confirm deleting their account. */
export const DELETE_CONFIRMATION = "DELETE";
