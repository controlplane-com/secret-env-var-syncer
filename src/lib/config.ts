import { readFile } from 'node:fs/promises';

import { parse } from 'yaml';

export type SyncTargetType = 'gvc' | 'workload';

export type FileConfig = {
  entries: SyncEntry[];
};

export type SyncEntry = {
  target: {
    type: SyncTargetType;
    name: string;
    gvc?: string;
    container?: string;
  };
  secret: string;
};

export type AppConfig = {
  apiBaseUrl: string;
  apiToken: string;
  apiTimeoutMs: number;
  orgName: string;
  fileConfig: FileConfig;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_API_BASE_URL = 'https://api.cpln.io';

export async function loadConfig(env: NodeJS.ProcessEnv, configPath = 'config.yaml'): Promise<AppConfig> {
  const apiToken = requireEnv(env, 'CPLN_TOKEN');
  const orgName = requireEnv(env, 'CPLN_ORG');
  const apiBaseUrl = parseApiBaseUrl(env.CPLN_ENDPOINT);
  const apiTimeoutMs = parsePositiveInt(env.API_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 'API_TIMEOUT_MS');
  const fileConfig = await loadFileConfig(configPath);

  return {
    apiBaseUrl,
    apiToken,
    apiTimeoutMs,
    orgName,
    fileConfig
  };
}

async function loadFileConfig(configPath: string): Promise<FileConfig> {
  const rawConfig = await readFile(configPath, 'utf8');
  const parsed: unknown = parse(rawConfig);

  if (!isRecord(parsed)) {
    throw new Error(`Invalid config file at ${configPath}: expected a YAML object`);
  }

  const entries = parsed.entries;

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`Invalid config file at ${configPath}: entries must be a non-empty array`);
  }

  return {
    entries: entries.map((entry, index) => parseEntry(configPath, entry, index))
  };
}

function parseEntry(configPath: string, entry: unknown, index: number): SyncEntry {
  if (!isRecord(entry)) {
    throw new Error(`Invalid config file at ${configPath}: entries[${String(index)}] must be an object`);
  }

  const target = entry.target;
  const secret = entry.secret;

  if (!isRecord(target)) {
    throw new Error(`Invalid config file at ${configPath}: entries[${String(index)}].target must be an object`);
  }

  const type = target.type;
  const name = target.name;
  const gvc = target.gvc;
  const container = target.container;

  if (type !== 'gvc' && type !== 'workload') {
    throw new Error(
      `Invalid config file at ${configPath}: entries[${String(index)}].target.type must be "gvc" or "workload"`
    );
  }

  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error(
      `Invalid config file at ${configPath}: entries[${String(index)}].target.name must be a non-empty string`
    );
  }

  if (typeof secret !== 'string' || secret.trim() === '') {
    throw new Error(
      `Invalid config file at ${configPath}: entries[${String(index)}].secret must be a non-empty string`
    );
  }

  if (type === 'workload' && (typeof gvc !== 'string' || gvc.trim() === '')) {
    throw new Error(
      `Invalid config file at ${configPath}: entries[${String(index)}].target.gvc must be provided for workload targets`
    );
  }

  if (type === 'workload' && (typeof container !== 'string' || container.trim() === '')) {
    throw new Error(
      `Invalid config file at ${configPath}: entries[${String(index)}].target.container must be provided for workload targets`
    );
  }

  return {
    target: {
      type,
      name: name.trim(),
      ...(typeof gvc === 'string' ? { gvc: gvc.trim() } : {}),
      ...(typeof container === 'string' ? { container: container.trim() } : {})
    },
    secret: secret.trim()
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: 'CPLN_TOKEN' | 'CPLN_ORG'): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function parsePositiveInt(value: string | undefined, fallback: number, key: string): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return parsed;
}

function parseApiBaseUrl(value: string | undefined): string {
  const candidate = value?.trim() ?? DEFAULT_API_BASE_URL;

  try {
    return new URL(candidate).toString();
  } catch {
    throw new Error('CPLN_ENDPOINT must be a valid absolute URL');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
