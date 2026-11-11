import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (user decision on PR #10). Session reads must sit inside
  // <Suspense>; see src/app/(main)/layout.tsx and src/app/login/page.tsx.
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
};

export default nextConfig;
