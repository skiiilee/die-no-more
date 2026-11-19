import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (user decision on PR #10). Session reads must sit inside
  // <Suspense>; see src/app/(main)/layout.tsx and src/app/login/page.tsx.
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // One pot photo (≤ 3 MB after browser resizing, PHOTO_RULES.maxUploadBytes)
      // plus the S05 fields and multipart overhead. The default is 1 MB.
      bodySizeLimit: "3200kb",
    },
  },
};

export default nextConfig;
