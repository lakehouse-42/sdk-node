/**
 * Lakehouse42 SDK - WebSocket Transport
 * Real-time streaming communication via WebSocket
 */

// Use dynamic import pattern for isomorphic WebSocket support
// In Node.js, 'ws' package is used; in browser, native WebSocket is used
let WebSocketImpl: typeof WebSocket;
if (typeof window === 'undefined') {
  // Node.js environment - use ws package
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  WebSocketImpl = require('ws');
} else {
  // Browser environment - use native WebSocket
  WebSocketImpl = WebSocket as unknown as typeof WebSocket;
}

import type {
  StreamSearchParams,
  StreamSource,
  StreamSourcesEvent,
  StreamContentEvent,
  StreamMetadataEvent,
  StreamCompleteEvent,
  ChatMessage,
} from './types';
import { LakehouseError, StreamError, NetworkError, AuthenticationError } from './errors';

// ============================================================================
// Types
// ============================================================================

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'authenticated'
  | 'disconnected'
  | 'reconnecting';

export interface WebSocketConfig {
  /** WebSocket URL (defaults to wss://ws.api.lakehouse42.com/v1/ws) */
  url?: string;
  /** API key for authentication */
  apiKey: string;
  /** Reconnection options */
  reconnect?: {
    /** Enable automatic reconnection (default: true) */
    enabled?: boolean;
    /** Maximum reconnection attempts (default: 5) */
    maxAttempts?: number;
    /** Initial delay between attempts in ms (default: 1000) */
    delay?: number;
    /** Maximum delay between attempts in ms (default: 30000) */
    maxDelay?: number;
  };
  /** Heartbeat options */
  heartbeat?: {
    /** Heartbeat interval in ms (default: 30000) */
    interval?: number;
    /** Timeout for pong response in ms (default: 10000) */
    timeout?: number;
  };
  /** Message queue options */
  queue?: {
    /** Enable message queuing during disconnection (default: true) */
    enabled?: boolean;
    /** Maximum queue size (default: 100) */
    maxSize?: number;
  };
}

export interface WebSocketMessage<T = unknown> {
  type: string;
  id?: string;
  payload?: T;
  timestamp: number;
}

export interface ChatStreamOptions {
  /** Session ID for conversation tracking */
  sessionId?: string;
  /** Conversation history */
  history?: ChatMessage[];
  /** Collection IDs to search */
  collectionIds?: string[];
  /** Model to use */
  model?: string;
  /** Temperature for generation */
  temperature?: number;
  /** Max tokens to generate */
  maxTokens?: number;
}

export interface ChatStreamCallbacks {
  /** Called when text content is received */
  onContent?: (content: string) => void;
  /** Called when sources are received */
  onSources?: (sources: Array<{
    documentId: string;
    title: string;
    snippet: string;
    score: number;
  }>) => void;
  /** Called when a citation is received */
  onCitation?: (citation: {
    documentId: string;
    title: string;
    snippet: string;
    pageNumber?: number;
  }) => void;
  /** Called when streaming is complete */
  onDone?: (metadata?: { tokensUsed?: number; model?: string; latencyMs?: number }) => void;
  /** Called on error */
  onError?: (error: { code: string; message: string }) => void;
}

export interface SearchStreamCallbacks {
  /** Called when sources are received */
  onSources?: (event: StreamSourcesEvent) => void;
  /** Called when content is received */
  onContent?: (event: StreamContentEvent) => void;
  /** Called when metadata is received */
  onMetadata?: (event: StreamMetadataEvent) => void;
  /** Called when search is complete */
  onComplete?: (event: StreamCompleteEvent) => void;
  /** Called on error */
  onError?: (error: { error: string }) => void;
}

type MessageCallback<T = unknown> = (payload: T, messageId?: string) => void;
type StateCallback = (state: ConnectionState) => void;
type ErrorCallback = (error: Error) => void;

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_WS_URL = 'wss://ws.api.lakehouse42.com/v1/ws';

const DEFAULT_CONFIG = {
  reconnect: {
    enabled: true,
    maxAttempts: 5,
    delay: 1000,
    maxDelay: 30000,
  },
  heartbeat: {
    interval: 30000,
    timeout: 10000,
  },
  queue: {
    enabled: true,
    maxSize: 100,
  },
};

// ============================================================================
// WebSocket Transport Class
// ============================================================================

/**
 * WebSocket transport for real-time communication with the Lakehouse42 API
 *
 * @example
 * ```typescript
 * import { createWebSocket } from '@lakehouse42/sdk';
 *
 * const ws = createWebSocket({
 *   apiKey: 'lh_xxx',
 * });
 *
 * await ws.connect();
 *
 * // Stream chat response
 * const cancel = ws.chat('What is the pricing?', {
 *   onContent: (content) => process.stdout.write(content),
 *   onSources: (sources) => console.log('Sources:', sources),
 *   onDone: () => console.log('\nDone!'),
 * });
 *
 * // Or collect everything
 * const { answer, sources } = await ws.chatCollect('What is the pricing?');
 *
 * ws.disconnect();
 * ```
 */
export class LakehouseWebSocket {
  private readonly config: WebSocketConfig & typeof DEFAULT_CONFIG;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ws: any = null;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatTimeoutTimer: NodeJS.Timeout | null = null;
  private messageQueue: WebSocketMessage[] = [];
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private messageIdCounter = 0;

  // Event listeners
  private stateListeners: Set<StateCallback> = new Set();
  private errorListeners: Set<ErrorCallback> = new Set();
  private messageListeners: Map<string, Set<MessageCallback>> = new Map();

  // Authentication state
  private authenticated = false;
  private organizationId: string | null = null;

  constructor(config: WebSocketConfig) {
    this.config = {
      ...config,
      url: config.url || DEFAULT_WS_URL,
      reconnect: { ...DEFAULT_CONFIG.reconnect, ...config.reconnect },
      heartbeat: { ...DEFAULT_CONFIG.heartbeat, ...config.heartbeat },
      queue: { ...DEFAULT_CONFIG.queue, ...config.queue },
    };
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.setState('connecting');

      try {
        // Create WebSocket with appropriate constructor based on environment
        if (typeof window === 'undefined') {
          // Node.js - ws package supports options
          this.ws = new WebSocketImpl(this.config.url!, {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
            },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        } else {
          // Browser - native WebSocket doesn't support headers in constructor
          // Auth will be sent after connection
          this.ws = new WebSocketImpl(this.config.url!);
        }

        this.ws.onopen = () => {
          this.setState('connected');
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.authenticate().then(resolve).catch(reject);
        };

        this.ws.onclose = (event: CloseEvent | { code: number; reason: string }) => {
          const code = 'code' in event ? event.code : 1000;
          const reason = 'reason' in event ? String(event.reason) : '';
          this.handleClose(code, reason);
        };

        this.ws.onerror = (event: Event | Error) => {
          const error = event instanceof Error ? event : new Error('WebSocket error');
          this.emitError(error);
          if (this.state === 'connecting') {
            reject(new NetworkError(error.message, error));
          }
        };

        this.ws.onmessage = (event: MessageEvent | { data: unknown }) => {
          const data = 'data' in event ? String(event.data) : '';
          this.handleMessage(data);
        };
      } catch (error) {
        this.setState('disconnected');
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.stopReconnect();
    this.stopHeartbeat();
    this.authenticated = false;
    this.organizationId = null;

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setState('disconnected');
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected and authenticated
   */
  isReady(): boolean {
    return this.state === 'authenticated' && this.authenticated;
  }

  /**
   * Get organization ID from authentication
   */
  getOrganizationId(): string | null {
    return this.organizationId;
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  private async authenticate(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new AuthenticationError('Authentication timeout'));
      }, 10000);

      const successHandler = (data: { organizationId: string; scopes: string[] }) => {
        clearTimeout(timeout);
        this.authenticated = true;
        this.organizationId = data.organizationId;
        this.setState('authenticated');
        this.flushMessageQueue();
        this.off('auth.success', successHandler);
        this.off('auth.error', errorHandler);
        resolve();
      };

      const errorHandler = (data: { code: string; message: string }) => {
        clearTimeout(timeout);
        this.off('auth.success', successHandler);
        this.off('auth.error', errorHandler);
        reject(new AuthenticationError(data.message));
      };

      this.on('auth.success', successHandler);
      this.on('auth.error', errorHandler);

      this.send({
        type: 'auth',
        payload: { apiKey: this.config.apiKey },
        timestamp: Date.now(),
      });
    });
  }

  // ============================================================================
  // Message Sending
  // ============================================================================

  private send(message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocketImpl.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else if (this.config.queue.enabled && message.type !== 'ping' && message.type !== 'pong') {
      this.queueMessage(message);
    }
  }

  /**
   * Send a message and wait for a specific response type
   * @internal
   */
  private async sendAndWait<T>(
    message: WebSocketMessage,
    responseType: string,
    timeout = 30000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.generateMessageId();
      message.id = id;

      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new StreamError(`Request timeout for ${message.type}`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (payload: unknown) => void,
        reject,
        timeout: timeoutId,
      });

      const handler: MessageCallback = (payload, messageId) => {
        if (messageId === id) {
          const pending = this.pendingRequests.get(id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(id);
            pending.resolve(payload);
          }
          this.off(responseType, handler);
        }
      };

      this.on(responseType, handler);
      this.send(message);
    });
  }

  private queueMessage(message: WebSocketMessage): void {
    if (this.messageQueue.length >= this.config.queue.maxSize) {
      this.messageQueue.shift();
    }
    this.messageQueue.push(message);
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now().toString(36)}_${(++this.messageIdCounter).toString(36)}`;
  }

  // ============================================================================
  // Chat Methods
  // ============================================================================

  /**
   * Send a chat message and receive streaming response
   *
   * @example
   * ```typescript
   * const cancel = ws.chat('What is the pricing?', {
   *   onContent: (content) => process.stdout.write(content),
   *   onSources: (sources) => console.log('Sources:', sources),
   *   onDone: () => console.log('\nDone!'),
   * });
   *
   * // Cancel if needed
   * // cancel();
   * ```
   */
  chat(
    message: string,
    callbacks: ChatStreamCallbacks,
    options: ChatStreamOptions = {}
  ): () => void {
    if (!this.isReady()) {
      throw new LakehouseError('WebSocket not connected or authenticated');
    }

    const sessionId = options.sessionId || `session_${Date.now().toString(36)}`;
    const messageId = this.generateMessageId();

    const streamHandler: MessageCallback<{
      contentType: 'text' | 'citation' | 'sources';
      content?: string;
      citation?: { documentId: string; title: string; snippet: string; pageNumber?: number };
      sources?: Array<{ documentId: string; title: string; snippet: string; score: number }>;
    }> = (payload, id) => {
      if (id === messageId) {
        if (payload.contentType === 'text' && payload.content && callbacks.onContent) {
          callbacks.onContent(payload.content);
        } else if (payload.contentType === 'citation' && payload.citation && callbacks.onCitation) {
          callbacks.onCitation(payload.citation);
        } else if (payload.contentType === 'sources' && payload.sources && callbacks.onSources) {
          callbacks.onSources(payload.sources);
        }
      }
    };

    const doneHandler: MessageCallback<{ tokensUsed?: number; model?: string; latencyMs?: number }> = (payload, id) => {
      if (id === messageId) {
        cleanup();
        callbacks.onDone?.(payload);
      }
    };

    const errorHandler: MessageCallback<{ code: string; message: string }> = (payload, id) => {
      if (id === messageId) {
        cleanup();
        callbacks.onError?.(payload);
      }
    };

    const cleanup = () => {
      this.off('chat.stream', streamHandler);
      this.off('chat.done', doneHandler);
      this.off('chat.error', errorHandler);
    };

    this.on('chat.stream', streamHandler);
    this.on('chat.done', doneHandler);
    this.on('chat.error', errorHandler);

    this.send({
      type: 'chat.message',
      id: messageId,
      payload: {
        sessionId,
        message,
        history: options.history,
        collectionIds: options.collectionIds,
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      },
      timestamp: Date.now(),
    });

    return cleanup;
  }

  /**
   * Send a chat message and collect the full response
   *
   * @example
   * ```typescript
   * const { answer, sources, metadata } = await ws.chatCollect('What is the pricing?');
   * console.log(answer);
   * ```
   */
  async chatCollect(
    message: string,
    options: ChatStreamOptions = {}
  ): Promise<{
    answer: string;
    sources: Array<{ documentId: string; title: string; snippet: string; score: number }>;
    metadata?: { tokensUsed?: number; model?: string; latencyMs?: number };
  }> {
    return new Promise((resolve, reject) => {
      let answer = '';
      let sources: Array<{ documentId: string; title: string; snippet: string; score: number }> = [];
      let metadata: { tokensUsed?: number; model?: string; latencyMs?: number } | undefined;

      this.chat(message, {
        onContent: (content) => {
          answer += content;
        },
        onSources: (s) => {
          sources = s;
        },
        onDone: (m) => {
          metadata = m;
          resolve({ answer, sources, metadata });
        },
        onError: (error) => {
          reject(new StreamError(error.message));
        },
      }, options);
    });
  }

  // ============================================================================
  // Search Methods
  // ============================================================================

  /**
   * Execute a non-streaming search query
   *
   * @example
   * ```typescript
   * const results = await ws.search({
   *   query: 'How do I deploy?',
   *   topK: 5,
   * });
   * console.log('Found:', results.totalResults, 'results');
   * ```
   */
  async search(params: Omit<StreamSearchParams, 'model'>): Promise<{
    results: Array<{
      chunkId: string;
      documentId: string;
      documentTitle: string | null;
      content: string | null;
      score: number;
      pageNumber: number | null;
      sectionTitle: string | null;
      highlights: string[];
    }>;
    query: string;
    mode: string;
    totalResults: number;
    processingTimeMs: number;
  }> {
    if (!this.isReady()) {
      throw new LakehouseError('WebSocket not connected or authenticated');
    }

    return this.sendAndWait(
      {
        type: 'search.query',
        payload: {
          query: params.query,
          collectionIds: params.collectionIds,
          documentIds: params.documentIds,
          topK: params.topK,
          stream: false,
        },
        timestamp: Date.now(),
      },
      'search.results'
    );
  }

  /**
   * Execute a streaming search with RAG
   *
   * @example
   * ```typescript
   * const cancel = ws.searchStream({
   *   query: 'How do I deploy?',
   *   topK: 5,
   * }, {
   *   onSources: (event) => console.log('Sources:', event.sources),
   *   onContent: (event) => process.stdout.write(event.content),
   *   onComplete: () => console.log('\nDone!'),
   * });
   * ```
   */
  searchStream(
    params: StreamSearchParams,
    callbacks: SearchStreamCallbacks
  ): () => void {
    if (!this.isReady()) {
      throw new LakehouseError('WebSocket not connected or authenticated');
    }

    const messageId = this.generateMessageId();

    const streamHandler: MessageCallback<{
      contentType: 'sources' | 'content' | 'metadata';
      content?: string;
      sources?: StreamSource[];
      metadata?: { tokensUsed: number; modelUsed: string; latencyMs: number };
    }> = (payload, id) => {
      if (id === messageId) {
        if (payload.contentType === 'sources' && payload.sources && callbacks.onSources) {
          callbacks.onSources({
            type: 'sources',
            sources: payload.sources,
            queryType: 'hybrid',
            weightsUsed: {},
          });
        } else if (payload.contentType === 'content' && payload.content && callbacks.onContent) {
          callbacks.onContent({
            type: 'content',
            content: payload.content,
          });
        } else if (payload.contentType === 'metadata' && payload.metadata && callbacks.onMetadata) {
          callbacks.onMetadata({
            type: 'metadata',
            tokensUsed: payload.metadata.tokensUsed,
            modelUsed: payload.metadata.modelUsed,
            latencyMs: payload.metadata.latencyMs,
            retrievalLatencyMs: 0,
          });
        }
      }
    };

    const doneHandler: MessageCallback<{ queryId: string }> = (payload, id) => {
      if (id === messageId) {
        cleanup();
        callbacks.onComplete?.({
          type: 'complete',
          queryId: payload.queryId,
        });
      }
    };

    const errorHandler: MessageCallback<{ code: string; message: string }> = (payload, id) => {
      if (id === messageId) {
        cleanup();
        callbacks.onError?.({ error: payload.message });
      }
    };

    const cleanup = () => {
      this.off('search.stream', streamHandler);
      this.off('search.done', doneHandler);
      this.off('search.error', errorHandler);
    };

    this.on('search.stream', streamHandler);
    this.on('search.done', doneHandler);
    this.on('search.error', errorHandler);

    this.send({
      type: 'search.query',
      id: messageId,
      payload: {
        query: params.query,
        collectionIds: params.collectionIds,
        documentIds: params.documentIds,
        topK: params.topK,
        model: params.model,
        stream: true,
      },
      timestamp: Date.now(),
    });

    return cleanup;
  }

  /**
   * Execute a streaming search and collect results
   */
  async searchStreamCollect(params: StreamSearchParams): Promise<{
    sources: StreamSource[];
    answer: string;
    metadata: StreamMetadataEvent | null;
    queryId: string | null;
  }> {
    return new Promise((resolve, reject) => {
      let sources: StreamSource[] = [];
      let answer = '';
      let metadata: StreamMetadataEvent | null = null;
      let queryId: string | null = null;

      this.searchStream(params, {
        onSources: (event) => {
          sources = event.sources;
        },
        onContent: (event) => {
          answer += event.content;
        },
        onMetadata: (event) => {
          metadata = event;
        },
        onComplete: (event) => {
          queryId = event.queryId;
          resolve({ sources, answer, metadata, queryId });
        },
        onError: (error) => {
          reject(new StreamError(error.error));
        },
      });
    });
  }

  // ============================================================================
  // Document Subscription
  // ============================================================================

  /**
   * Subscribe to document status updates
   *
   * @example
   * ```typescript
   * const unsubscribe = ws.subscribeToDocuments(
   *   ['doc-1', 'doc-2'],
   *   (status) => {
   *     console.log(`Document ${status.documentId}: ${status.status}`);
   *     if (status.progress) {
   *       console.log(`Progress: ${status.progress}%`);
   *     }
   *   }
   * );
   *
   * // Later, unsubscribe
   * unsubscribe();
   * ```
   */
  subscribeToDocuments(
    documentIds: string[],
    callback: (status: {
      documentId: string;
      status: 'pending' | 'processing' | 'ready' | 'failed';
      progress?: number;
      step?: string;
      error?: string;
      chunkCount?: number;
    }) => void
  ): () => void {
    if (!this.isReady()) {
      throw new LakehouseError('WebSocket not connected or authenticated');
    }

    this.on('document.status', callback);
    this.send({
      type: 'document.subscribe',
      payload: { documentIds },
      timestamp: Date.now(),
    });

    return () => {
      this.off('document.status', callback);
      this.send({
        type: 'document.unsubscribe',
        payload: { documentIds },
        timestamp: Date.now(),
      });
    };
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  /**
   * Subscribe to a message type
   */
  on<T = unknown>(type: string, callback: MessageCallback<T>): void {
    if (!this.messageListeners.has(type)) {
      this.messageListeners.set(type, new Set());
    }
    this.messageListeners.get(type)!.add(callback as MessageCallback);
  }

  /**
   * Unsubscribe from a message type
   */
  off<T = unknown>(type: string, callback: MessageCallback<T>): void {
    const listeners = this.messageListeners.get(type);
    if (listeners) {
      listeners.delete(callback as MessageCallback);
    }
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: StateCallback): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  /**
   * Subscribe to errors
   */
  onError(callback: ErrorCallback): () => void {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  private handleMessage(data: string): void {
    let message: WebSocketMessage;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    // Handle pong for heartbeat
    if (message.type === 'pong') {
      this.clearHeartbeatTimeout();
      return;
    }

    // Emit to listeners
    const listeners = this.messageListeners.get(message.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(message.payload, message.id);
        } catch (error) {
          console.error('Message listener error:', error);
        }
      }
    }
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (error) {
        console.error('State listener error:', error);
      }
    }
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch (e) {
        console.error('Error listener error:', e);
      }
    }
  }

  // ============================================================================
  // Reconnection
  // ============================================================================

  private handleClose(code: number, _reason: string): void {
    this.stopHeartbeat();
    this.authenticated = false;

    // Clean up pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new NetworkError('Connection closed'));
      this.pendingRequests.delete(id);
    }

    if (this.config.reconnect.enabled && code !== 1000) {
      this.attemptReconnect();
    } else {
      this.setState('disconnected');
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.reconnect.maxAttempts) {
      this.setState('disconnected');
      this.emitError(new NetworkError('Max reconnection attempts reached'));
      return;
    }

    this.setState('reconnecting');
    this.reconnectAttempts++;

    const delay = Math.min(
      this.config.reconnect.delay * Math.pow(2, this.reconnectAttempts - 1),
      this.config.reconnect.maxDelay
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        console.error('Reconnection failed:', error);
        this.attemptReconnect();
      });
    }, delay);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  // ============================================================================
  // Heartbeat
  // ============================================================================

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', timestamp: Date.now() });
        this.setHeartbeatTimeout();
      }
    }, this.config.heartbeat.interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearHeartbeatTimeout();
  }

  private setHeartbeatTimeout(): void {
    this.heartbeatTimeoutTimer = setTimeout(() => {
      console.warn('Heartbeat timeout - connection may be dead');
      if (this.ws) {
        this.ws.close(4000, 'Heartbeat timeout');
      }
    }, this.config.heartbeat.timeout);
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }
}

/**
 * Create a WebSocket transport instance
 */
export function createWebSocket(config: WebSocketConfig): LakehouseWebSocket {
  return new LakehouseWebSocket(config);
}
