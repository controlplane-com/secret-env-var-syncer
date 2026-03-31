import type { ApiClient } from '../lib/api-client.js';
import type { AppConfig } from '../lib/config.js';

export type RunJobOptions = {
  apiClient: ApiClient;
  config: AppConfig;
};

type SecretResource = {
  kind?: string;
  name?: string;
  type?: string;
  data?: unknown;
  stringData?: unknown;
  secret?: unknown;
  payload?: unknown;
};

type EnvVar = {
  name: string;
  value: string;
};

type GvcResource = {
  kind?: string;
  name: string;
  spec?: {
    env?: EnvVar[];
  };
};

type WorkloadContainer = {
  name?: string;
  env?: EnvVar[];
};

type WorkloadResource = {
  kind?: string;
  name: string;
  spec?: {
    containers?: WorkloadContainer[];
  };
};

type SyncResult = {
  updated: boolean;
  envCount: number;
};

export async function runJob({ apiClient, config }: RunJobOptions): Promise<void> {
  const { orgName, fileConfig } = config;
  const secretKeysByName = new Map<string, string[]>();
  let syncedCount = 0;
  let updatedCount = 0;

  for (const [index, entry] of fileConfig.entries.entries()) {
    logInfo('entry.start', {
      entryIndex: index,
      orgName,
      secretName: entry.secret,
      target: describeTarget(entry)
    });

    try {
      const secretKeys = await loadSecretKeys(apiClient, orgName, entry.secret, secretKeysByName);
      const result =
        entry.target.type === 'gvc'
          ? await syncGvcEnvVars(apiClient, orgName, entry.secret, entry.target.name, secretKeys)
          : await syncWorkloadEnvVars(
              apiClient,
              orgName,
              entry.secret,
              entry.target.gvc,
              entry.target.name,
              entry.target.container,
              secretKeys
            );

      syncedCount += result.envCount;
      updatedCount += result.updated ? 1 : 0;

      logInfo('entry.success', {
        entryIndex: index,
        orgName,
        secretName: entry.secret,
        target: describeTarget(entry),
        envCount: result.envCount,
        updated: result.updated
      });
    } catch (error: unknown) {
      logError('entry.error', {
        entryIndex: index,
        orgName,
        secretName: entry.secret,
        target: describeTarget(entry),
        error: formatError(error)
      });
      throw error;
    }
  }

  logInfo('job.completed', {
    orgName,
    entryCount: fileConfig.entries.length,
    syncedCount,
    updatedCount
  });
}

async function loadSecretKeys(
  apiClient: ApiClient,
  orgName: string,
  secretName: string,
  secretKeysByName: Map<string, string[]>
): Promise<string[]> {
  const cached = secretKeysByName.get(secretName);

  if (cached) {
    return cached;
  }

  const secret = await apiClient.get<SecretResource>(
    `/org/${encodeURIComponent(orgName)}/secret/${encodeURIComponent(secretName)}/-reveal`
  );

  assertDictionarySecret(secret, secretName);

  const secretKeys = extractSecretKeys(secret);

  if (secretKeys.length === 0) {
    throw new Error(`Secret "${secretName}" did not expose any dictionary keys to sync`);
  }

  secretKeysByName.set(secretName, secretKeys);

  return secretKeys;
}

async function syncGvcEnvVars(
  apiClient: ApiClient,
  orgName: string,
  secretName: string,
  gvcName: string,
  secretKeys: string[]
): Promise<SyncResult> {
  const path = `/org/${encodeURIComponent(orgName)}/gvc/${encodeURIComponent(gvcName)}`;
  const gvc = await apiClient.get<GvcResource>(path);
  const currentEnv = gvc.spec?.env ?? [];
  const nextEnv = mergeEnvVars(currentEnv, secretName, secretKeys);

  if (envVarsEqual(currentEnv, nextEnv)) {
    return {
      updated: false,
      envCount: nextEnv.length
    };
  }

  await apiClient.put<GvcResource>(path, {
    ...gvc,
    spec: {
      ...gvc.spec,
      env: nextEnv
    }
  });

  return {
    updated: true,
    envCount: nextEnv.length
  };
}

async function syncWorkloadEnvVars(
  apiClient: ApiClient,
  orgName: string,
  secretName: string,
  gvcName: string | undefined,
  workloadName: string,
  containerName: string | undefined,
  secretKeys: string[]
): Promise<SyncResult> {
  if (!gvcName) {
    throw new Error('Workload sync requires target.gvc in config.yaml');
  }

  if (!containerName) {
    throw new Error('Workload sync requires target.container in config.yaml');
  }

  const path = `/org/${encodeURIComponent(orgName)}/gvc/${encodeURIComponent(gvcName)}/workload/${encodeURIComponent(workloadName)}`;
  const workload = await apiClient.get<WorkloadResource>(path);
  const containers = workload.spec?.containers;

  if (!containers || containers.length === 0) {
    throw new Error(`Workload "${workloadName}" does not contain any containers to update`);
  }

  const containerFound = containers.some((container) => container.name === containerName);

  if (!containerFound) {
    throw new Error(`Workload "${workloadName}" does not contain a container named "${containerName}"`);
  }

  const currentContainer = containers.find((container) => container.name === containerName);

  if (!currentContainer) {
    throw new Error(`Workload "${workloadName}" does not contain a container named "${containerName}"`);
  }

  const nextEnv = mergeEnvVars(currentContainer.env ?? [], secretName, secretKeys);

  if (envVarsEqual(currentContainer.env ?? [], nextEnv)) {
    return {
      updated: false,
      envCount: nextEnv.length
    };
  }

  const nextContainers = containers.map((container) =>
    container.name === containerName
      ? {
        ...container,
          env: nextEnv
        }
      : container
  );

  await apiClient.put<WorkloadResource>(path, {
    ...workload,
    spec: {
      ...workload.spec,
      containers: nextContainers
    }
  });

  return {
    updated: true,
    envCount: nextEnv.length
  };
}

function assertDictionarySecret(secret: SecretResource, secretName: string): void {
  const secretType = typeof secret.type === 'string' ? secret.type : typeof secret.kind === 'string' ? secret.kind : '';

  if (!secretType.toLowerCase().includes('dictionary')) {
    throw new Error(`Secret "${secretName}" is not a dictionary secret`);
  }
}

function extractSecretKeys(secret: SecretResource): string[] {
  const candidate = [secret.data, secret.stringData, secret.secret, secret.payload].find(isRecord);

  if (!candidate) {
    return [];
  }

  return Object.keys(candidate).sort((left, right) => left.localeCompare(right));
}

function mergeEnvVars(existingEnv: EnvVar[], secretName: string, secretKeys: string[]): EnvVar[] {
  const envByName = new Map(existingEnv.map((item) => [item.name, item]));

  for (const key of secretKeys) {
    envByName.set(key, {
      name: key,
      value: `cpln://secret/${secretName}.${key}`
    });
  }

  return [...envByName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function envVarsEqual(left: EnvVar[], right: EnvVar[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function describeTarget(entry: AppConfig['fileConfig']['entries'][number]): Record<string, string> {
  return {
    type: entry.target.type,
    name: entry.target.name,
    ...(entry.target.gvc ? { gvc: entry.target.gvc } : {}),
    ...(entry.target.container ? { container: entry.target.container } : {})
  };
}

function formatError(error: unknown): string {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);

  return message.replaceAll(/\s*\n\s*/g, ' ').trim();
}

function logInfo(event: string, details: Record<string, unknown>): void {
  console.info(JSON.stringify({ event, ...details }));
}

function logError(event: string, details: Record<string, unknown>): void {
  console.error(JSON.stringify({ event, ...details }));
}

export { extractSecretKeys, mergeEnvVars, assertDictionarySecret, envVarsEqual };
