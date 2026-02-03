/**
 * Lakehouse42 SDK - Search Operations
 */

import type { Lakehouse } from './client';
import type {
  SearchParams,
  SearchResponse,
  ChatCompletionParams,
  ChatCompletionResponse,
  ChatStreamChunk,
  StreamSearchParams,
  StreamEvent,
  StreamSourcesEvent,
  StreamContentEvent,
  StreamMetadataEvent,
  StreamCompleteEvent,
  ChatSource,
} from './types';
import { ValidationError, StreamError } from './errors';

/**
 * Callback type for streaming events
 */
export type StreamCallback<T> = (event: T) => void;

/**
 * Options for streaming search
 */
export interface StreamSearchOptions {
  onSources?: StreamCallback<StreamSourcesEvent>;
  onContent?: StreamCallback<StreamContentEvent>;
  onMetadata?: StreamCallback<StreamMetadataEvent>;
  onComplete?: StreamCallback<StreamCompleteEvent>;
  onError?: StreamCallback<{ error: string }>;
  signal?: AbortSignal;
}

/**
 * Options for streaming chat
 */
export interface StreamChatOptions {
  onSources?: StreamCallback<ChatSource[]>;
  onChunk?: StreamCallback<ChatStreamChunk>;
  onDone?: StreamCallback<void>;
  onError?: StreamCallback<{ error: string }>;
  signal?: AbortSignal;
}

/**
 * Search operations for the Lakehouse42 API
 */
export class Search {
  private readonly client: Lakehouse;

  constructor(client: Lakehouse) {
    this.client = client;
  }

  /**
   * Execute a hybrid search query
   *
   * @example
   * ```typescript
   * const results = await lakehouse.search.query({
   *   query: 'How do I configure authentication?',
   *   mode: 'hybrid',
   *   top_k: 10,
   *   collection_ids: ['collection-uuid'],
   *   rerank: true,
   * });
   *
   * for (const result of results.results) {
   *   console.log(result.document_title, result.score);
   * }
   * ```
   */
  async query(params: SearchParams): Promise<SearchResponse> {
    if (!params.query) {
      throw new ValidationError('Query is required', 'missing_query', 'query');
    }

    return this.client.request<SearchResponse>('/api/v1/search', {
      method: 'POST',
      body: {
        query: params.query,
        mode: params.mode ?? 'hybrid',
        top_k: params.top_k ?? 10,
        min_score: params.min_score ?? 0,
        collection_ids: params.collection_ids,
        document_ids: params.document_ids,
        filters: params.filters,
        include_content: params.include_content ?? true,
        include_metadata: params.include_metadata ?? true,
        rerank: params.rerank ?? false,
        weights: params.weights,
      },
    });
  }

  /**
   * Execute a chat completion with RAG
   *
   * @example
   * ```typescript
   * const response = await lakehouse.search.chat({
   *   messages: [
   *     { role: 'user', content: 'What is the pricing model?' }
   *   ],
   *   use_knowledge_base: true,
   *   include_sources: true,
   * });
   *
   * console.log(response.choices[0].message.content);
   * if (response.sources) {
   *   console.log('Sources:', response.sources);
   * }
   * ```
   */
  async chat(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    if (!params.messages || params.messages.length === 0) {
      throw new ValidationError('At least one message is required', 'missing_messages', 'messages');
    }

    return this.client.request<ChatCompletionResponse>('/api/v1/chat/completions', {
      method: 'POST',
      body: {
        messages: params.messages,
        model: params.model ?? 'gpt-4-turbo',
        temperature: params.temperature ?? 0.7,
        max_tokens: params.max_tokens ?? 1024,
        stream: false,
        use_knowledge_base: params.use_knowledge_base ?? true,
        search_top_k: params.search_top_k ?? 5,
        collection_ids: params.collection_ids,
        include_sources: params.include_sources ?? true,
        session_id: params.session_id,
      },
    });
  }

  /**
   * Execute a streaming chat completion with RAG
   *
   * @example
   * ```typescript
   * let fullContent = '';
   *
   * await lakehouse.search.chatStream({
   *   messages: [{ role: 'user', content: 'Explain the architecture' }],
   * }, {
   *   onSources: (sources) => console.log('Sources:', sources),
   *   onChunk: (chunk) => {
   *     const content = chunk.choices[0]?.delta?.content;
   *     if (content) {
   *       fullContent += content;
   *       process.stdout.write(content);
   *     }
   *   },
   *   onDone: () => console.log('\n\nStreaming complete'),
   * });
   * ```
   */
  async chatStream(
    params: ChatCompletionParams,
    options: StreamChatOptions = {}
  ): Promise<void> {
    if (!params.messages || params.messages.length === 0) {
      throw new ValidationError('At least one message is required', 'missing_messages', 'messages');
    }

    const stream = await this.client.streamRequest('/api/v1/chat/completions', {
      messages: params.messages,
      model: params.model ?? 'gpt-4-turbo',
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens ?? 1024,
      stream: true,
      use_knowledge_base: params.use_knowledge_base ?? true,
      search_top_k: params.search_top_k ?? 5,
      collection_ids: params.collection_ids,
      include_sources: params.include_sources ?? true,
      session_id: params.session_id,
    }, { signal: options.signal });

    await this.processSSEStream(stream, {
      onEvent: (eventData) => {
        // Handle sources event
        if (eventData.type === 'sources' && options.onSources) {
          options.onSources(eventData.sources as ChatSource[]);
          return;
        }

        // Handle error event
        if (eventData.error && options.onError) {
          const errorObj = eventData.error as { message?: string } | string;
          const errorMsg = typeof errorObj === 'string' ? errorObj : errorObj.message || String(errorObj);
          options.onError({ error: errorMsg });
          return;
        }

        // Handle chat completion chunk
        if (eventData.object === 'chat.completion.chunk' && options.onChunk) {
          options.onChunk(eventData as unknown as ChatStreamChunk);
        }
      },
      onDone: () => {
        options.onDone?.();
      },
      onError: (error) => {
        options.onError?.({ error });
      },
    });
  }

  /**
   * Execute a streaming RAG search with SSE
   *
   * @example
   * ```typescript
   * let answer = '';
   *
   * await lakehouse.search.stream({
   *   query: 'What are the system requirements?',
   *   collectionIds: ['docs-collection'],
   * }, {
   *   onSources: (event) => {
   *     console.log('Found sources:', event.sources.length);
   *   },
   *   onContent: (event) => {
   *     answer += event.content;
   *     process.stdout.write(event.content);
   *   },
   *   onMetadata: (event) => {
   *     console.log(`Completed in ${event.latencyMs}ms`);
   *   },
   *   onComplete: (event) => {
   *     console.log('Query ID:', event.queryId);
   *   },
   * });
   * ```
   */
  async stream(
    params: StreamSearchParams,
    options: StreamSearchOptions = {}
  ): Promise<void> {
    if (!params.query) {
      throw new ValidationError('Query is required', 'missing_query', 'query');
    }

    const stream = await this.client.streamRequest('/api/search/stream', {
      query: params.query,
      collectionIds: params.collectionIds,
      documentIds: params.documentIds,
      topK: params.topK ?? 10,
      model: params.model,
    }, { signal: options.signal });

    await this.processSSEStream(stream, {
      onEvent: (eventData) => {
        const event = eventData as unknown as StreamEvent;

        switch (event.type) {
          case 'sources':
            options.onSources?.(event as StreamSourcesEvent);
            break;
          case 'content':
            options.onContent?.(event as StreamContentEvent);
            break;
          case 'metadata':
            options.onMetadata?.(event as StreamMetadataEvent);
            break;
          case 'complete':
            options.onComplete?.(event as StreamCompleteEvent);
            break;
          case 'error':
            options.onError?.({ error: event.error });
            break;
        }
      },
      onDone: () => {
        // Stream complete
      },
      onError: (error) => {
        options.onError?.({ error });
      },
    });
  }

  /**
   * Execute a streaming RAG search and collect all results
   *
   * @example
   * ```typescript
   * const { sources, answer, metadata, queryId } = await lakehouse.search.streamCollect({
   *   query: 'How do I deploy the application?',
   * });
   * ```
   */
  async streamCollect(params: StreamSearchParams): Promise<{
    sources: StreamSourcesEvent['sources'];
    answer: string;
    metadata: StreamMetadataEvent | null;
    queryId: string | null;
  }> {
    let sources: StreamSourcesEvent['sources'] = [];
    let answer = '';
    let metadata: StreamMetadataEvent | null = null;
    let queryId: string | null = null;

    await this.stream(params, {
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
      },
    });

    return { sources, answer, metadata, queryId };
  }

  /**
   * Process an SSE stream
   */
  private async processSSEStream(
    stream: ReadableStream<Uint8Array>,
    callbacks: {
      onEvent: (data: Record<string, unknown>) => void;
      onDone: () => void;
      onError: (error: string) => void;
    }
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete events in the buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) {
            continue;
          }

          const data = line.slice(6).trim();

          if (data === '[DONE]') {
            callbacks.onDone();
            continue;
          }

          try {
            const eventData = JSON.parse(data);
            callbacks.onEvent(eventData);
          } catch {
            // Ignore parse errors for malformed chunks
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Stream was aborted by user
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown streaming error';
      callbacks.onError(errorMessage);
      throw new StreamError(errorMessage);
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Create an async iterator for streaming content
   *
   * @example
   * ```typescript
   * for await (const event of lakehouse.search.streamIterator({
   *   query: 'What is the pricing?',
   * })) {
   *   if (event.type === 'content') {
   *     process.stdout.write(event.content);
   *   }
   * }
   * ```
   */
  async *streamIterator(
    params: StreamSearchParams,
    options: { signal?: AbortSignal } = {}
  ): AsyncGenerator<StreamEvent> {
    const stream = await this.client.streamRequest('/api/search/stream', {
      query: params.query,
      collectionIds: params.collectionIds,
      documentIds: params.documentIds,
      topK: params.topK ?? 10,
      model: params.model,
    }, { signal: options.signal });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) {
            continue;
          }

          const data = line.slice(6).trim();

          if (data === '[DONE]') {
            return;
          }

          try {
            const event = JSON.parse(data) as StreamEvent;
            yield event;
          } catch {
            // Ignore parse errors
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
