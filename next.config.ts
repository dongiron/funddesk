import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // The proxy (src/middleware.ts) buffers each request body in memory, capped
    // at 10MB by default. TaptoSign signed contract PDFs reach ~10MB base64, so
    // raise the cap for the /api/extensions/taptosign/pdf-extract upload. This is
    // global (route-segment config has no body-size option in Next 16); the route
    // handler enforces its own 20MB base64 cap on top of this.
    proxyClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
