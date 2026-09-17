/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@radix-ui/react-slot', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs', '@radix-ui/react-tooltip', '@radix-ui/react-progress', '@radix-ui/react-select', '@radix-ui/react-separator', '@radix-ui/react-avatar'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  // Optimize for production
  poweredByHeader: false,
  compress: true,
  // Local dev only: when API_PROXY_TARGET is set (e.g. http://localhost:8000),
  // proxy same-origin /api/* to the FastAPI backend. Unset on Vercel — the
  // platform routes /api to the serverless functions, so prod is unaffected.
  ...(process.env.API_PROXY_TARGET
    ? {
        rewrites: async () => [
          {
            source: '/api/:path*',
            destination: `${process.env.API_PROXY_TARGET}/api/:path*`,
          },
        ],
      }
    : {}),
}

module.exports = nextConfig