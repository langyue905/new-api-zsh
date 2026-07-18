import type { NextConfig } from 'next';

const isFrontendMode = process.env.NEXT_PUBLIC_ENABLE_FRONTEND_MODE === 'true';
const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || (isGitHubPages ? '/sora-2-playground' : '');

const nextConfig: NextConfig = {
    ...(isFrontendMode
        ? {
              output: 'export' as const,
              images: {
                  unoptimized: true
              },
              ...(basePath && {
                  basePath,
                  assetPrefix: `${basePath}/`
              })
          }
        : {})
};

export default nextConfig;
