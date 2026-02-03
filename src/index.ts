/**
 * Lakehouse42 Node.js SDK
 *
 * A TypeScript SDK for the Lakehouse42 API.
 *
 * @packageDocumentation
 */

// Export main client
export { Lakehouse, createClient } from './client';
export type { RequestOptions } from './client';

// Export resource modules
export { Documents } from './documents';
export { Collections } from './collections';
export { Search } from './search';
export type { StreamCallback, StreamSearchOptions, StreamChatOptions } from './search';
export { Entities } from './entities';
export { TimeTravel } from './time-travel';

// Export all types
export type {
  // Configuration
  LakehouseConfig,

  // Common
  PaginationParams,
  PaginatedResponse,
  ApiResponse,
  DeleteResponse,

  // Documents
  Document,
  DocumentDetail,
  DocumentStatus,
  ContentType,
  ChunkingStrategy,
  Chunk,
  CreateDocumentParams,
  UpdateDocumentParams,
  ListDocumentsParams,
  ListDocumentsResponse,
  UploadDocumentParams,
  UploadDocumentResponse,

  // Collections
  Collection,
  RetrievalWeights,
  TopKConfig,
  RetrievalConfig,
  CreateCollectionParams,
  UpdateCollectionParams,
  ListCollectionsResponse,
  DeleteCollectionResponse,

  // Search
  SearchMode,
  SearchFilter,
  SearchParams,
  SearchResult,
  SearchResponse,

  // Chat
  ChatMessage,
  ChatCompletionParams,
  ChatSource,
  ChatChoice,
  ChatUsage,
  ChatCompletionResponse,
  ChatStreamChoice,
  ChatStreamChunk,

  // Streaming
  StreamSearchParams,
  StreamSource,
  StreamSourcesEvent,
  StreamContentEvent,
  StreamMetadataEvent,
  StreamCompleteEvent,
  StreamErrorEvent,
  StreamEvent,

  // Entities/Knowledge Graph
  EntityNodeType,
  EntityNode,
  EntityEdge,
  GraphStats,
  KnowledgeGraphResponse,
  GetKnowledgeGraphParams,

  // Time Travel
  TimeTravelQueryParams,
  TimeTravelQueryResult,
  TimeTravelDiffParams,
  SchemaChange,
  DiffResult,
  ListSnapshotsParams,
  SnapshotInfo,
  ListSnapshotsResponse,

  // Batch Upload
  BatchUploadOptions,
  BatchUploadedDocument,
  BatchUploadResult,

  // Discovery
  ApiEndpoint,
  RateLimitTier,
  DiscoveryInfo,

  // Errors
  ApiErrorType,
  ApiErrorResponse,
} from './types';

// Export error classes
export {
  LakehouseError,
  LakehouseApiError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
  QuotaExceededError,
  RateLimitError,
  ServerError,
  TimeoutError,
  NetworkError,
  StreamError,
  createApiError,
  isLakehouseError,
  isApiError,
  isRetryableError,
} from './errors';

// Export WebSocket transport
export { LakehouseWebSocket, createWebSocket } from './websocket';
export type {
  ConnectionState,
  WebSocketConfig,
  WebSocketMessage,
  ChatStreamOptions,
  ChatStreamCallbacks,
  SearchStreamCallbacks,
} from './websocket';

// Default export
import { Lakehouse } from './client';
export default Lakehouse;
