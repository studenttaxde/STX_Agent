import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if required environment variables are set
    const openaiKey = process.env.OPENAI_API_KEY;
    const pdfExtractorUrl = process.env.PDF_EXTRACTOR_URL || 'http://localhost:8001';

    const checks = {
      openai_configured: !!openaiKey,
      pdf_extractor_url: pdfExtractorUrl,
      pdf_extractor_healthy: false
    };

    // Check PDF extractor service health
    try {
      const response = await fetch(`${pdfExtractorUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      checks.pdf_extractor_healthy = response.ok;
    } catch (error) {
      console.warn('PDF extractor health check failed:', error);
      checks.pdf_extractor_healthy = false;
    }

    const allHealthy = checks.openai_configured && checks.pdf_extractor_healthy;

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
