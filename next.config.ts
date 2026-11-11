import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off: every screen is per-user and session-bound,
  // so there is no shared static shell worth prerendering yet.
  poweredByHeader: false,
};

export default nextConfig;
