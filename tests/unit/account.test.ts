import { describe, expect, it } from "vitest";
import { profileSchema } from "@/lib/account/profile";

describe("profile details", () => {
  it("trims and saves blanks as not set", () => {
    expect(profileSchema.parse({ full_name: "  Denise Okafor ", email: "", phone: " ", location: "Dayton, OH" })).toEqual({
      full_name: "Denise Okafor",
      email: null,
      phone: null,
      location: "Dayton, OH",
    });
  });

  it("rejects an email that isn't one, with a plain message", () => {
    const result = profileSchema.safeParse({ full_name: "", email: "not an email", phone: "", location: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter an email address like name@example.com, or leave it blank.");
  });

  it("refuses unknown fields such as plan", () => {
    const parsed = profileSchema.parse({ full_name: "A", email: "", phone: "", location: "", plan: "pro" } as never);
    expect(parsed).not.toHaveProperty("plan");
  });
});
