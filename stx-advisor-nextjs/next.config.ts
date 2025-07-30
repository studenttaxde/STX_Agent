import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  env: {
    BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:8001'
  }
}

export default nextConfig
