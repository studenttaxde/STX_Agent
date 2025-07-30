import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if required environment variables are set
    const openaiKey = process.env.OPENAI_API_KEY;
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8001';

    const checks = {
      openai_configured: !!openaiKey,
      backend_url: backendUrl,
      backend_healthy: false
    };

    // Check backend service health
    try {
      const response = await fetch(`${backendUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      checks.backend_healthy = response.ok;
    } catch (error) {
      console.warn('Backend health check failed:', error);
      checks.backend_healthy = false;
    }

    const allHealthy = checks.openai_configured && checks.backend_healthy;

    return NextResponse.json({
      status: allHealthy ? 'healthy' : 'degraded',
      service: 'tax-agent-nextjs',
      timestamp: new Date().toISOString(),
      checks
    }, {
      status: allHealthy ? 200 : 503
    });

  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      service: 'tax-agent-nextjs',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }, {
      status: 500
    });
  }
}
