export const config = {
  backendUrl: process.env.BACKEND_URL || 'http://localhost:8001',
  isDevelopment: process.env.NODE_ENV === 'development'
} 