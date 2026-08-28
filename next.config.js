/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  
  experimental: {
    // Enable PWA features
  },

  // Headers configuration
  headers: async () => [
    {
      // API routes: never cache in browser/CDN — data is user-specific
      // and must always be fresh after mutations
      source: '/api/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'private, no-cache, no-store, must-revalidate',
        },
        {
          key: 'Pragma',
          value: 'no-cache',
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
        {
          key: 'Cross-Origin-Opener-Policy',
          value: 'same-origin-allow-popups',
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=()',
        },
        {
          key: 'Content-Security-Policy',
          value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.googletagmanager.com https://www.google-analytics.com https://*.firebaseio.com https://*.firebaseapp.com https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://storage.googleapis.com https://firebasestorage.googleapis.com https://*.googleusercontent.com https://lh3.googleusercontent.com https://www.googletagmanager.com https://www.google-analytics.com https://*.gstatic.com; connect-src 'self' https://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.googleapis.com https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://accounts.google.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://doosplit.firebaseapp.com; child-src 'self' https://*.firebaseapp.com https://accounts.google.com blob:;",
        },
      ],
    },
  ],

  // Image optimization for PWA
  images: {
    domains: ["storage.googleapis.com", "firebasestorage.googleapis.com"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
    ],
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
