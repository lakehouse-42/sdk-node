/**
 * Lakehouse42 SDK - Main Client
 */

import type { LakehouseConfig, ApiErrorResponse, DiscoveryInfo } from './types';
import {
  LakehouseError,
  NetworkError,
  TimeoutError,
  RateLimitError,
  createApiError,
  isRetryableError,
} from './errors';
import { Documents } from './documents';
import { Collections } from './collections';
import { Search } from './search';
import { Entities } from './entities';
import { TimeTravel } from './time-travel';

const DEFAULT_BASE_URL = 'https://api.lakehouse42.com';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
  raw?: boolean;
}

/**
 * Main client for the Lakehouse42 API
 */
export class Lakehouse {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly customHeaders: Record<string, string>;

  /** Document operations */
  readonly documents: Documents;
  /** Collection operations */
  readonly collections: Collections;
  /** Search operations */
  readonly search: Search;
  /** Entity/graph operations */
  readonly entities: Entities;
  /** Time travel operations */
  readonly timeTravel: TimeTravel;

  constructor(config: LakehouseConfig) {
    if (!config.apiKey) {
      throw new LakehouseError('API key is required');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.customHeaders = config.headers ?? {};

    // Initialize resource modules
    this.documents = new Documents(this);
    this.collections = new Collections(this);
    this.search = new Search(this);
    this.entities = new Entities(this);
    this.timeTravel = new TimeTravel(this);
  }

  /**
   * Discover API capabilities without authentication.
   *
   * This is a static method that can be called without creating a client instance.
   * It returns information about available endpoints, authentication requirements,
   * rate limits, and documentation links.
   *
   * @param baseUrl - Optional base URL (defaults to https://api.lakehouse42.com)
   *
   * @example
   * ```typescript
   * // Discover API capabilities
   * const info = await Lakehouse.discover();
   *
   * console.log(`API: ${info.name} v${info.version}`);
   * console.log('Available endpoints:');
   * for (const endpoint of info.endpoints) {
   *   console.log(`  ${endpoint.method} ${endpoint.path} - ${endpoint.description}`);
   * }
   *
   * // With custom base URL
   * const info = await Lakehouse.discover('https://custom.lakehouse42.com');
   * ```
   */
  static async discover(baseUrl: string = DEFAULT_BASE_URL): Promise<DiscoveryInfo> {
    const url = `${baseUrl.replace(/\/$/, '')}/api/v1`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'lakehouse42-node/1.0.0',
      },
    });

    if (!response.ok) {
      throw new NetworkError(`Failed to discover API: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<DiscoveryInfo>;
  }

  /**
   * Get the base URL for API requests
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Get default headers for requests
   */
  getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'lakehouse42-node/1.0.0',
      ...this.customHeaders,
    };
  }

  /**
   * Make an HTTP request to the API
   */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {}, timeout, signal, raw = false } = options;

    const url = `${this.baseUrl}${path}`;
    const requestTimeout = timeout ?? this.timeout;

    let lastError: Error | undefined;
    let retryCount = 0;

    while (retryCount <= this.maxRetries) {
      try {
        const result = await this.executeRequest<T>(
          url,
          method,
          body,
          headers,
          requestTimeout,
          signal,
          raw
        );
        return result;
      } catch (error) {
        lastError = error as Error;

        // Don't retry if the signal was aborted
        if (signal?.aborted) {
          throw error;
        }

        // Check if error is retryable
        if (!isRetryableError(error) || retryCount >= this.maxRetries) {
          throw error;
        }

        // Calculate delay with exponential backoff
        let delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);

        // Use retry-after header if available
        if (error instanceof RateLimitError && error.retryAfter) {
          delay = error.retryAfter * 1000;
        }

        // Add jitter
        delay += Math.random() * 1000;

        await this.sleep(delay);
        retryCount++;
      }
    }

    throw lastError;
  }

  /**
   * Execute a single HTTP request
   */
  private async executeRequest<T>(
    url: string,
    method: string,
    body: unknown,
    headers: Record<string, string>,
    timeout: number,
    signal?: AbortSignal,
    raw?: boolean
  ): Promise<T> {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Combine signals if one was provided
    const combinedSignal = signal
      ? this.combineAbortSignals(signal, controller.signal)
      : controller.signal;

    try {
      const requestInit: RequestInit = {
        method,
        headers: {
          ...this.getHeaders(),
          ...headers,
        },
        signal: combinedSignal,
      };

      if (body !== undefined && method !== 'GET') {
        if (body instanceof FormData) {
          requestInit.body = body;
          // Remove Content-Type header to let browser set it with boundary
          delete (requestInit.headers as Record<string, string>)['Content-Type'];
        } else {
          requestInit.body = JSON.stringify(body);
        }
      }

      const response = await fetch(url, requestInit);

      clearTimeout(timeoutId);

      // Handle error responses
      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      // Return raw response if requested
      if (raw) {
        return response as unknown as T;
      }

      // Parse JSON response
      const json = await response.json();

      // Extract data from API envelope
      if (json.data !== undefined) {
        return json.data as T;
      }

      return json as T;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (signal?.aborted) {
          throw error; // User-initiated abort
        }
        throw new TimeoutError(timeout);
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new NetworkError('Network request failed', error);
      }

      throw error;
    }
  }

  /**
   * Handle error responses from the API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorData: ApiErrorResponse | undefined;

    try {
      errorData = await response.json();
    } catch {
      // If we can't parse the error response, throw a generic error
      throw new NetworkError(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Extract retry-after header for rate limit errors
    const retryAfter = response.headers.get('Retry-After');
    const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;

    throw createApiError(errorData as ApiErrorResponse, response.status, retryAfterSeconds);
  }

  /**
   * Combine multiple abort signals
   */
  private combineAbortSignals(signal1: AbortSignal, signal2: AbortSignal): AbortSignal {
    const controller = new AbortController();

    const abort = () => controller.abort();

    if (signal1.aborted || signal2.aborted) {
      controller.abort();
    } else {
      signal1.addEventListener('abort', abort);
      signal2.addEventListener('abort', abort);
    }

    return controller.signal;
  }

  /**
   * Sleep for a given duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Make a streaming request (for SSE endpoints)
   */
  async streamRequest(
    path: string,
    body: unknown,
    options: { signal?: AbortSignal } = {}
  ): Promise<ReadableStream<Uint8Array>> {
    const url = `${this.baseUrl}${path}`;
    const { signal } = options;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    if (!response.body) {
      throw new NetworkError('No response body for streaming request');
    }

    return response.body;
  }
}

/**
 * Create a new Lakehouse42 client
 */
export function createClient(config: LakehouseConfig): Lakehouse {
  return new Lakehouse(config);
}
