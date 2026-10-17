import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

const siteUrl = appUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/applications", "/vault", "/settings", "/onboarding", "/upgrade", "/auth/", "/start"] },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}
