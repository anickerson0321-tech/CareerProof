import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

const siteUrl = appUrl();

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/demo", "/demo/application", "/privacy", "/terms", "/contact", "/login"].map((path) => ({
    url: new URL(path, siteUrl).toString(),
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
