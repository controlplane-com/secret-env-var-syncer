import { describe, expect, it, vi } from 'vitest';

import { assertDictionarySecret, envVarsEqual, extractSecretKeys, mergeEnvVars, runJob } from './run-job.js';

describe('runJob', () => {
  it('syncs dictionary secret keys to a gvc env list', async () => {
    const get = vi.fn();
    get.mockResolvedValueOnce({
      type: 'dictionary'
      ,
      data: {
        API_KEY: 'masked',
        API_URL: 'masked'
      }
    });
    get.mockResolvedValueOnce({
      kind: 'gvc',
      name: 'edge',
      spec: {
        env: [
          {
            name: 'EXISTING_VAR',
            value: 'keep-me'
          }
        ]
      }
    });

    const put = vi.fn().mockResolvedValue(undefined);

    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await runJob({
      apiClient: {
        get,
        post: vi.fn(),
        put
      },
      config: {
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
      }
    });

    expect(get).toHaveBeenNthCalledWith(1, '/org/demo-org/secret/shared-secret/-reveal');
    expect(get).toHaveBeenNthCalledWith(2, '/org/demo-org/gvc/edge');
    expect(put).toHaveBeenCalledWith('/org/demo-org/gvc/edge', {
      kind: 'gvc',
      name: 'edge',
      spec: {
        env: [
          {
            name: 'API_KEY',
            value: 'cpln://secret/shared-secret.API_KEY'
          },
          {
            name: 'API_URL',
            value: 'cpln://secret/shared-secret.API_URL'
          },
          {
            name: 'EXISTING_VAR',
            value: 'keep-me'
          }
        ]
      }
    });
    expect(info).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'entry.start',
        entryIndex: 0,
        orgName: 'demo-org',
        secretName: 'shared-secret',
        target: {
          type: 'gvc',
          name: 'edge'
        }
      })
    );
    expect(info).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'entry.success',
        entryIndex: 0,
        orgName: 'demo-org',
        secretName: 'shared-secret',
        target: {
          type: 'gvc',
          name: 'edge'
        },
        envCount: 3,
        updated: true
      })
    );
    expect(info).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'job.completed',
        orgName: 'demo-org',
        entryCount: 1,
        syncedCount: 3,
        updatedCount: 1
      })
    );
  });

  it('syncs only the named workload container', async () => {
    const get = vi.fn();
    get.mockResolvedValueOnce({
      type: 'dictionary'
      ,
      data: {
        API_KEY: 'masked'
      }
    });
    get.mockResolvedValueOnce({
      kind: 'workload',
      name: 'api',
      spec: {
        containers: [
          {
            name: 'app',
            env: [
              {
                name: 'KEEP_ME',
                value: 'yes'
              }
            ]
          },
          {
            name: 'sidecar',
            env: [
              {
                name: 'SIDECAR_ONLY',
                value: 'true'
              }
            ]
          }
        ]
      }
    });

    const put = vi.fn().mockResolvedValue(undefined);

    await runJob({
      apiClient: {
        get,
        post: vi.fn(),
        put
      },
      config: {
        apiBaseUrl: 'https://api.cpln.io/',
        apiToken: 'secret-token',
        apiTimeoutMs: 10_000,
        orgName: 'demo-org',
        fileConfig: {
          entries: [
            {
              secret: 'shared-secret',
              target: {
                type: 'workload',
                name: 'api',
                gvc: 'apps',
                container: 'app'
              }
            }
          ]
        }
      }
    });

    expect(get).toHaveBeenNthCalledWith(1, '/org/demo-org/secret/shared-secret/-reveal');
    expect(get).toHaveBeenNthCalledWith(2, '/org/demo-org/gvc/apps/workload/api');
    expect(put).toHaveBeenCalledWith('/org/demo-org/gvc/apps/workload/api', {
      kind: 'workload',
      name: 'api',
      spec: {
        containers: [
          {
            name: 'app',
            env: [
              {
                name: 'API_KEY',
                value: 'cpln://secret/shared-secret.API_KEY'
              },
              {
                name: 'KEEP_ME',
                value: 'yes'
              }
            ]
          },
          {
            name: 'sidecar',
            env: [
              {
                name: 'SIDECAR_ONLY',
                value: 'true'
              }
            ]
          }
        ]
      }
    });
  });

  it('skips the gvc update when env vars are already correct', async () => {
    const get = vi.fn();
    get.mockResolvedValueOnce({
      type: 'dictionary'
      ,
      data: {
        API_KEY: 'masked'
      }
    });
    get.mockResolvedValueOnce({
      kind: 'gvc',
      name: 'edge',
      spec: {
        env: [
          {
            name: 'API_KEY',
            value: 'cpln://secret/shared-secret.API_KEY'
          }
        ]
      }
    });

    const put = vi.fn().mockResolvedValue(undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await runJob({
      apiClient: {
        get,
        post: vi.fn(),
        put
      },
      config: {
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
      }
    });

    expect(put).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'entry.start',
        entryIndex: 0,
        orgName: 'demo-org',
        secretName: 'shared-secret',
        target: {
          type: 'gvc',
          name: 'edge'
        }
      })
    );
    expect(info).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'entry.success',
        entryIndex: 0,
        orgName: 'demo-org',
        secretName: 'shared-secret',
        target: {
          type: 'gvc',
          name: 'edge'
        },
        envCount: 1,
        updated: false
      })
    );
    expect(info).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'job.completed',
        orgName: 'demo-org',
        entryCount: 1,
        syncedCount: 1,
        updatedCount: 0
      })
    );
  });

  it('skips the workload update when the target container is already correct', async () => {
    const get = vi.fn();
    get.mockResolvedValueOnce({
      type: 'dictionary'
      ,
      data: {
        API_KEY: 'masked'
      }
    });
    get.mockResolvedValueOnce({
      kind: 'workload',
      name: 'api',
      spec: {
        containers: [
          {
            name: 'app',
            env: [
              {
                name: 'API_KEY',
                value: 'cpln://secret/shared-secret.API_KEY'
              }
            ]
          },
          {
            name: 'sidecar',
            env: [
              {
                name: 'SIDECAR_ONLY',
                value: 'true'
              }
            ]
          }
        ]
      }
    });

    const put = vi.fn().mockResolvedValue(undefined);

    await runJob({
      apiClient: {
        get,
        post: vi.fn(),
        put
      },
      config: {
        apiBaseUrl: 'https://api.cpln.io/',
        apiToken: 'secret-token',
        apiTimeoutMs: 10_000,
        orgName: 'demo-org',
        fileConfig: {
          entries: [
            {
              secret: 'shared-secret',
              target: {
                type: 'workload',
                name: 'api',
                gvc: 'apps',
                container: 'app'
              }
            }
          ]
        }
      }
    });

    expect(put).not.toHaveBeenCalled();
  });

  it('logs the failing entry before rethrowing', async () => {
    const get = vi.fn().mockRejectedValue(new Error('permission denied'));
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      runJob({
        apiClient: {
          get,
          post: vi.fn(),
          put: vi.fn()
        },
        config: {
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
        }
      })
    ).rejects.toThrowError('permission denied');

    expect(info).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'entry.start',
        entryIndex: 0,
        orgName: 'demo-org',
        secretName: 'shared-secret',
        target: {
          type: 'gvc',
          name: 'edge'
        }
      })
    );
    expect(error).toHaveBeenCalledTimes(1);

    const rawLoggedError: unknown = vi.mocked(error).mock.calls[0]?.[0];

    expect(typeof rawLoggedError).toBe('string');

    const loggedError = JSON.parse(rawLoggedError as string) as {
      event: string;
      entryIndex: number;
      orgName: string;
      secretName: string;
      target: { type: string; name: string };
      error: string;
    };

    expect(loggedError.event).toBe('entry.error');
    expect(loggedError.entryIndex).toBe(0);
    expect(loggedError.orgName).toBe('demo-org');
    expect(loggedError.secretName).toBe('shared-secret');
    expect(loggedError.target).toEqual({
      type: 'gvc',
      name: 'edge'
    });
    expect(loggedError.error).toContain('Error: permission denied');
  });
});

describe('helper behavior', () => {
  it('extracts sorted keys from a dictionary secret payload', () => {
    expect(
      extractSecretKeys({
        data: {
          Z_KEY: 'masked',
          A_KEY: 'masked'
        }
      })
    ).toEqual(['A_KEY', 'Z_KEY']);
  });

  it('overwrites matching env vars and keeps unrelated ones', () => {
    expect(
      mergeEnvVars(
        [
          {
            name: 'API_KEY',
            value: 'old'
          },
          {
            name: 'OTHER',
            value: 'keep'
          }
        ],
        'shared-secret',
        ['API_KEY', 'API_URL']
      )
    ).toEqual([
      {
        name: 'API_KEY',
        value: 'cpln://secret/shared-secret.API_KEY'
      },
      {
        name: 'API_URL',
        value: 'cpln://secret/shared-secret.API_URL'
      },
      {
        name: 'OTHER',
        value: 'keep'
      }
    ]);
  });

  it('rejects non-dictionary secrets', () => {
    expect(() => assertDictionarySecret({ type: 'opaque' }, 'shared-secret')).toThrowError(
      'Secret "shared-secret" is not a dictionary secret'
    );
  });

  it('detects equal env var lists', () => {
    expect(
      envVarsEqual(
        [
          {
            name: 'A',
            value: '1'
          }
        ],
        [
          {
            name: 'A',
            value: '1'
          }
        ]
      )
    ).toBe(true);
  });
});
