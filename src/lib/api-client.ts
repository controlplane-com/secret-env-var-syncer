import type { AppConfig } from './config.js';

export type ApiClient = {
  get<TResponse>(path: string): Promise<TResponse>;
  post<TResponse>(path: string, body: unknown): Promise<TResponse>;
  put<TResponse>(path: string, body: unknown): Promise<TResponse>;
};

export function createApiClient(config: AppConfig): ApiClient {
  return {
    async get<TResponse>(path: string): Promise<TResponse> {
      return request<TResponse>(config, path, {
        method: 'GET'
      });
    },
    async post<TResponse>(path: string, body: unknown): Promise<TResponse> {
      return request<TResponse>(config, path, {
        method: 'POST',
        body: JSON.stringify(body)
      });
    },
    async put<TResponse>(path: string, body: unknown): Promise<TResponse> {
      return request<TResponse>(config, path, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
    }
  };
}

async function request<TResponse>(
  config: AppConfig,
  path: string,
  init: RequestInit
): Promise<TResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.apiTimeoutMs);

  try {
    const url = new URL(path, config.apiBaseUrl);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${config.apiToken}`);
    headers.set('Content-Type', 'application/json');

    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers
    });

    if (!response.ok) {
      throw new Error(
        `API request failed with status ${String(response.status)} ${response.statusText}`
      );
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return (await response.json()) as TResponse;
  } finally {
    clearTimeout(timeout);
  }
}
