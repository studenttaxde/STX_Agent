import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  env: {
    BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:8001'
  }
}

export default nextConfig
