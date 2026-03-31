import { describe, expect, it } from 'vitest';

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, type FileConfig } from './config.js';

describe('loadConfig', () => {
  it('loads env vars and yaml config', async () => {
    const configPath = await writeConfigFile({
      entries: [
        {
          secret: 'shared-secret',
          target: {
            type: 'gvc',
            name: 'edge'
          }
        }
      ]
    });

    const config = await loadConfig(
      {
        CPLN_ORG: 'demo-org',
        CPLN_TOKEN: 'secret-token'
      },
      configPath
    );

    expect(config).toEqual({
      apiBaseUrl: 'https://api.cpln.io/',
      apiToken: 'secret-token',
      apiTimeoutMs: 10_000,
      orgName: 'demo-org',
      fileConfig: {
        entries: [
          {
            secret: 'shared-secret',
            target: {
              type: 'gvc',
              name: 'edge'
            }
          }
        ]
      }
    });
  });

  it('uses CPLN_ENDPOINT when provided', async () => {
    const configPath = await writeConfigFile({
      entries: [
        {
          secret: 'shared-secret',
          target: {
            type: 'gvc',
            name: 'edge'
          }
        }
      ]
    });

    const config = await loadConfig(
      {
        CPLN_ENDPOINT: 'https://api.example.internal',
        CPLN_ORG: 'demo-org',
        CPLN_TOKEN: 'secret-token'
      },
      configPath
    );

    expect(config.apiBaseUrl).toBe('https://api.example.internal/');
  });

  it('rejects a workload target without a container', async () => {
    const configPath = await writeConfigFile({
      entries: [
        {
          secret: 'shared-secret',
          target: {
            type: 'workload',
            name: 'api',
            gvc: 'apps'
          }
        }
      ]
    });

    await expect(
      loadConfig(
        {
          CPLN_ORG: 'demo-org',
          CPLN_TOKEN: 'secret-token'
        },
        configPath
      )
    ).rejects.toThrowError('target.container must be provided for workload targets');
  });

  it('rejects an invalid timeout', async () => {
    const configPath = await writeConfigFile({
      entries: [
        {
          secret: 'shared-secret',
          target: {
            type: 'gvc',
            name: 'edge'
          }
        }
      ]
    });

    await expect(
      loadConfig(
        {
          CPLN_ORG: 'demo-org',
          CPLN_TOKEN: 'secret-token',
          API_TIMEOUT_MS: '0'
        },
        configPath
      )
    ).rejects.toThrowError('API_TIMEOUT_MS must be a positive integer');
  });

  it('rejects an invalid CPLN_ENDPOINT', async () => {
    const configPath = await writeConfigFile({
      entries: [
        {
          secret: 'shared-secret',
          target: {
            type: 'gvc',
            name: 'edge'
          }
        }
      ]
    });

    await expect(
      loadConfig(
        {
          CPLN_ENDPOINT: 'not-a-url',
          CPLN_ORG: 'demo-org',
          CPLN_TOKEN: 'secret-token'
        },
        configPath
      )
    ).rejects.toThrowError('CPLN_ENDPOINT must be a valid absolute URL');
  });
});

async function writeConfigFile(config: FileConfig): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'secret-env-var-syncer-'));
  const path = join(directory, 'config.yaml');

  await writeFile(path, `${serializeConfig(config)}\n`, 'utf8');

  return path;
}

function serializeConfig(config: FileConfig): string {
  const lines = ['entries:'];

  for (const entry of config.entries) {
    lines.push('  - target:');
    lines.push(`      type: ${entry.target.type}`);
    lines.push(`      name: ${entry.target.name}`);

    if (entry.target.gvc) {
      lines.push(`      gvc: ${entry.target.gvc}`);
    }

    if (entry.target.container) {
      lines.push(`      container: ${entry.target.container}`);
    }

    lines.push(`    secret: ${entry.secret}`);
  }

  return lines.join('\n');
}
