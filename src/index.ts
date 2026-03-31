import { createApiClient } from './lib/api-client.js';
import { loadConfig } from './lib/config.js';
import { runJob } from './job/run-job.js';

async function main(): Promise<void> {
  const config = await loadConfig(process.env);
  const apiClient = createApiClient(config);

  await runJob({
    apiClient,
    config
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  const singleLineMessage = message.replaceAll(/\s*\n\s*/g, ' ').trim();
  console.error(singleLineMessage);
  process.exitCode = 1;
});
