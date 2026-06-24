import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Type-checking runs locally and in CI; Railway's build environment has a
    // module-resolution quirk with @supabase/supabase-js that blocks deploys.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
