import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  env: {
    BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:8001'
  },
  // Ensure proper handling of environment variables
  serverExternalPackages: ['@netlify/plugin-nextjs']
}

export default nextConfig
