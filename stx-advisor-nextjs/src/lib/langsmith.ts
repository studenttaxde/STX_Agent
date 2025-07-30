import { Client } from 'langsmith';

// LangSmith configuration
export const configureLangSmith = () => {
  const apiKey = process.env.LANGCHAIN_API_KEY || process.env.NEXT_PUBLIC_LANGCHAIN_API_KEY;
  const projectName = process.env.LANGCHAIN_PROJECT || process.env.NEXT_PUBLIC_LANGCHAIN_PROJECT || 'STX_Advisor';
  const endpoint = process.env.LANGCHAIN_ENDPOINT || process.env.NEXT_PUBLIC_LANGCHAIN_ENDPOINT || 'https://api.smith.langchain.com';

  if (!apiKey) {
    console.warn('LangSmith API key not found. Tracing will be disabled.');
    return null;
  }

  try {
    // Set environment variables for LangSmith
    process.env.LANGCHAIN_TRACING_V2 = 'true';
    process.env.LANGCHAIN_PROJECT = projectName;
    process.env.LANGCHAIN_ENDPOINT = endpoint;

    const client = new Client({
      apiKey: apiKey,
      apiUrl: endpoint
    });

    console.log(`LangSmith tracing configured for project: ${projectName}`);
    console.log(`LangSmith endpoint: ${endpoint}`);
    console.log(`LangSmith tracing enabled: true`);

    return client;
  } catch (error) {
    console.error('Failed to configure LangSmith:', error);
    return null;
  }
};

// Initialize LangSmith client
export const langSmithClient = configureLangSmith();

// Create a new trace run
export const createTraceRun = async (name: string, inputs: any, tags: string[] = []) => {
  if (!langSmithClient) {
    console.warn('LangSmith client not available, skipping trace creation');
    return null;
  }

  try {
    const run = await langSmithClient.createRun({
      name: name,
      inputs: inputs,
      run_type: 'chain', // Required field for LangSmith
      start_time: new Date().toISOString()
    });

    console.log(`Created LangSmith trace: ${name}`);
    return run;
  } catch (error) {
    console.error('Failed to create LangSmith trace:', error);
    return null;
  }
};

// Update an existing trace run
export const updateTraceRun = async (runId: string, outputs: any, error?: string) => {
  if (!langSmithClient || !runId) {
    console.warn('LangSmith client not available or invalid runId, skipping trace update');
    return null;
  }

  try {
    await langSmithClient.updateRun(runId, {
      outputs,
      error: error || undefined,
      end_time: new Date().toISOString()
    });

    console.log(`Updated LangSmith trace: ${runId}`);
    return true;
  } catch (error) {
    console.error('Failed to update LangSmith trace:', error);
    return null;
  }
}; 