import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The PDF and Word exports read these fonts from disk at runtime.
  outputFileTracingIncludes: {
    "/api/documents/*/export": ["./lib/render/fonts/**/*"],
    "/api/documents/*/fit": ["./lib/render/fonts/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
