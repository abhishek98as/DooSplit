/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Enable PWA features
  },

  // PWA Configuration
  headers: async () => [
    {
      // Apply to all API routes
      source: '/api/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400',
        },
      ],
    },
    {
      // Apply to static assets
      source: '/:path*',
      headers: [
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
      ],
    },
  ],

  // Image optimization for PWA
  images: {
    domains: ['imagekit.io'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },


  // Webpack configuration for PWA
  webpack: (config, { dev, isServer }) => {
    // Copy service worker to public directory
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }

    return config;
  },
};

module.exports = nextConfig;