export const config = {
  backendUrl: process.env.BACKEND_URL || 'https://stx-agent.onrender.com',
  isDevelopment: process.env.NODE_ENV === 'development'
} 