import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/utils";

describe("safeNextPath", () => {
  it("keeps same-site paths with their query and hash", () => {
    expect(safeNextPath("/vault")).toBe("/vault");
    expect(safeNextPath("/applications/abc?tab=resume#top")).toBe("/applications/abc?tab=resume#top");
  });

  it.each([
    null,
    "",
    "vault",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    "https://evil.com",
    "/%0a",
    "/" + "a".repeat(600),
  ])("refuses %j", (value) => {
    const result = safeNextPath(value);
    expect(result === "/start" || !/evil/.test(result)).toBe(true);
    expect(new URL(result, "https://app.example").origin).toBe("https://app.example");
  });

  it("refuses targets a browser would send off-site", () => {
    for (const value of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com"]) {
      expect(safeNextPath(value)).toBe("/start");
    }
  });
});
