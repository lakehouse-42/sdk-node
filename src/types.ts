/**
 * Lakehouse42 SDK - TypeScript Types
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface LakehouseConfig {
  /** API key for authentication */
  apiKey: string;
  /** Base URL for the API (defaults to https://api.lakehouse42.com) */
  baseUrl?: string;
  /** Request timeout in milliseconds (defaults to 30000) */
  timeout?: number;
  /** Maximum number of retry attempts (defaults to 3) */
  maxRetries?: number;
  /** Custom headers to include with every request */
  headers?: Record<string, string>;
}

// ============================================================================
// Common Types
// ============================================================================

export interface PaginationParams {
  /** Number of items per page (max 100) */
  limit?: number;
  /** Cursor for pagination */
  cursor?: string;
}

export interface PaginatedResponse<T> {
  has_more: boolean;
  next_cursor: string | null;
  data: T[];
}

export interface ApiResponse<T> {
  data: T;
  meta: {
    request_id: string;
    timestamp: string;
  };
}

export interface DeleteResponse {
  deleted: boolean;
  id: string;
}

// ============================================================================
// Document Types
// ============================================================================

export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type ContentType = 'text/plain' | 'text/markdown' | 'text/html';
export type ChunkingStrategy = 'semantic' | 'fixed' | 'paragraph';

export interface Document {
  id: string;
  title: string;
  content_type: string;
  status: DocumentStatus;
  chunk_count: number;
  word_count: number | null;
  collection_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DocumentDetail extends Document {
  size_bytes: number;
  collection_name: string | null;
  processing_error: string | null;
  chunks: Chunk[];
}

export interface Chunk {
  id: string;
  chunk_index: number;
  content: string;
  page_number: number | null;
  section_title: string | null;
}

export interface CreateDocumentParams {
  /** Document content */
  content: string;
  /** Document title */
  title: string;
  /** Content type (defaults to text/plain) */
  content_type?: ContentType;
  /** Collection ID to add document to */
  collection_id?: string | null;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Chunking strategy for processing */
  chunking_strategy?: ChunkingStrategy;
}

export interface UpdateDocumentParams {
  /** New document title */
  title?: string;
  /** New collection ID (null to remove from collection) */
  collection_id?: string | null;
  /** Updated metadata */
  metadata?: Record<string, unknown>;
}

export interface ListDocumentsParams extends PaginationParams {
  /** Filter by collection ID (use "null" for uncategorized) */
  collection_id?: string | null;
  /** Filter by document status */
  status?: DocumentStatus;
  /** Search by title */
  search?: string;
}

export interface ListDocumentsResponse {
  documents: Document[];
  has_more: boolean;
  next_cursor: string | null;
  total_count: number;
}

export interface UploadDocumentParams {
  /** File to upload */
  file: File | Blob | Buffer;
  /** Filename (required for Buffer, optional for File/Blob) */
  filename?: string;
  /** Document title (defaults to filename) */
  title?: string;
  /** Collection ID */
  collection_id?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

export interface UploadDocumentResponse {
  id: string;
  title: string;
  content_type: string;
  status: DocumentStatus;
  size_bytes: number;
  collection_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Collection Types
// ============================================================================

export interface RetrievalWeights {
  dense: number;
  sparse: number;
  bm25: number;
}

export interface TopKConfig {
  initial: number;
  after_fusion: number;
  final: number;
}

export interface RetrievalConfig {
  default_weights?: RetrievalWeights;
  reranking_enabled?: boolean;
  top_k?: TopKConfig;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  is_default: boolean;
  document_count: number;
  retrieval_config: RetrievalConfig | null;
  metadata_schema: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCollectionParams {
  /** Collection name */
  name: string;
  /** Collection description */
  description?: string;
  /** Color in hex format (e.g., "#6366f1") */
  color?: string;
  /** Icon name */
  icon?: string;
  /** Set as default collection */
  is_default?: boolean;
  /** Retrieval configuration */
  retrieval_config?: RetrievalConfig;
  /** Metadata schema for documents */
  metadata_schema?: Record<string, unknown>;
}

export interface UpdateCollectionParams {
  name?: string;
  description?: string | null;
  color?: string;
  icon?: string;
  is_default?: boolean;
  retrieval_config?: RetrievalConfig | null;
  metadata_schema?: Record<string, unknown> | null;
}

export interface ListCollectionsResponse {
  collections: Collection[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface DeleteCollectionResponse extends DeleteResponse {
  documents_moved_to_uncategorized: number;
}

// ============================================================================
// Search Types
// ============================================================================

export type SearchMode = 'vector' | 'keyword' | 'hybrid';

export interface SearchFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: unknown;
}

export interface SearchParams {
  /** Search query */
  query: string;
  /** Search mode (defaults to hybrid) */
  mode?: SearchMode;
  /** Number of results to return (defaults to 10, max 100) */
  top_k?: number;
  /** Minimum relevance score (0-1) */
  min_score?: number;
  /** Filter by collection IDs */
  collection_ids?: string[];
  /** Filter by document IDs */
  document_ids?: string[];
  /** Custom filters */
  filters?: SearchFilter[];
  /** Include content in results (defaults to true) */
  include_content?: boolean;
  /** Include metadata in results (defaults to true) */
  include_metadata?: boolean;
  /** Enable reranking */
  rerank?: boolean;
  /** Custom weights for hybrid search */
  weights?: RetrievalWeights;
}

export interface SearchResult {
  chunk_id: string;
  document_id: string;
  document_title: string | null;
  content: string | null;
  score: number;
  page_number: number | null;
  section_title: string | null;
  metadata: Record<string, unknown> | null;
  highlights: string[];
  retriever_contributions: Record<string, number>;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  mode: string;
  total_results: number;
  processing_time_ms: number;
  weights_used: Record<string, number>;
  query_id: string;
}

// ============================================================================
// Chat Types
// ============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionParams {
  /** Chat messages */
  messages: ChatMessage[];
  /** Model to use */
  model?: string;
  /** Temperature (0-2) */
  temperature?: number;
  /** Max tokens to generate */
  max_tokens?: number;
  /** Enable streaming */
  stream?: boolean;
  /** Use knowledge base for RAG */
  use_knowledge_base?: boolean;
  /** Number of search results for RAG */
  search_top_k?: number;
  /** Filter by collection IDs */
  collection_ids?: string[];
  /** Include sources in response */
  include_sources?: boolean;
  /** Session ID for conversation memory */
  session_id?: string;
}

export interface ChatSource {
  document_id: string;
  document_title: string;
  chunk_id: string;
  content_preview: string;
  relevance_score: number;
}

export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string;
}

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatChoice[];
  usage: ChatUsage;
  sources?: ChatSource[];
}

export interface ChatStreamChoice {
  index: number;
  delta: { content?: string; role?: string };
  finish_reason: string | null;
}

export interface ChatStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatStreamChoice[];
}

// ============================================================================
// Streaming Search Types
// ============================================================================

export interface StreamSearchParams {
  /** Search query */
  query: string;
  /** Collection IDs to search */
  collectionIds?: string[];
  /** Document IDs to search */
  documentIds?: string[];
  /** Number of results */
  topK?: number;
  /** Model to use for generation */
  model?: string;
}

export interface StreamSource {
  chunkId: string;
  documentId: string;
  documentName: string | null;
  content: string;
  score: number;
  pageNumber: number | null;
  sectionTitle: string | null;
  retrieverContributions: Record<string, number>;
}

export interface StreamSourcesEvent {
  type: 'sources';
  sources: StreamSource[];
  queryType: string;
  weightsUsed: Record<string, number>;
}

export interface StreamContentEvent {
  type: 'content';
  content: string;
}

export interface StreamMetadataEvent {
  type: 'metadata';
  tokensUsed: number;
  modelUsed: string;
  latencyMs: number;
  retrievalLatencyMs: number;
}

export interface StreamCompleteEvent {
  type: 'complete';
  queryId: string;
}

export interface StreamErrorEvent {
  type: 'error';
  error: string;
}

export type StreamEvent =
  | StreamSourcesEvent
  | StreamContentEvent
  | StreamMetadataEvent
  | StreamCompleteEvent
  | StreamErrorEvent;

// ============================================================================
// Entity/Knowledge Graph Types
// ============================================================================

export type EntityNodeType = 'document' | 'concept' | 'person' | 'team' | 'entity';

export interface EntityNode {
  id: string;
  label: string;
  type: EntityNodeType;
  metadata: {
    normalizedName: string;
    entityType: string;
    confidence: number;
    attributes: Record<string, unknown>;
    sourceDocumentIds: string[];
    externalIds: Record<string, string>;
  };
}

export interface EntityEdge {
  source: string;
  target: string;
  label: string;
  weight: number;
}

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  avgConnections: number;
}

export interface KnowledgeGraphResponse {
  nodes: EntityNode[];
  edges: EntityEdge[];
  stats: GraphStats;
}

export interface GetKnowledgeGraphParams {
  /** Maximum number of nodes to return (max 500) */
  limit?: number;
  /** Filter by document ID */
  documentId?: string;
}

// ============================================================================
// Time Travel Types
// ============================================================================

export interface TimeTravelQueryParams {
  /** Name of the Iceberg table to query */
  table_name: string;
  /** Iceberg namespace (typically org_{id}) */
  namespace: string;
  /** Specific snapshot ID to query */
  snapshot_id?: string;
  /** ISO timestamp to query as of */
  as_of_timestamp?: string;
  /** Custom SQL query */
  query?: string;
  /** Columns to return */
  columns?: string[];
  /** WHERE clause for filtering */
  where?: string;
  /** Maximum number of rows (default: 100, max: 10000) */
  limit?: number;
}

export interface TimeTravelQueryResult {
  /** Query result rows */
  rows: Record<string, unknown>[];
  /** Column names in the result set */
  columns: string[];
  /** Total number of rows returned */
  row_count: number;
  /** The queried table name */
  table_name: string;
  /** Snapshot ID used for the query */
  snapshot_id: string | null;
  /** Timestamp used for the query */
  as_of_timestamp: string | null;
  /** Time taken to process the request in ms */
  latency_ms: number;
}

export interface TimeTravelDiffParams {
  /** Name of the Iceberg table */
  table_name: string;
  /** Iceberg namespace */
  namespace: string;
  /** Starting snapshot ID */
  from_snapshot_id: string;
  /** Ending snapshot ID */
  to_snapshot_id: string;
}

export interface SchemaChange {
  /** Field name that changed */
  field: string;
  /** Type of change (added, removed, modified) */
  change: string;
}

export interface DiffResult {
  /** Number of rows added between snapshots */
  added_rows: number;
  /** Number of rows deleted between snapshots */
  deleted_rows: number;
  /** Number of rows changed (always 0 for file-level diffs) */
  changed_rows: number;
  /** Schema changes between snapshots */
  schema_changes: SchemaChange[];
  /** Number of data files that changed */
  changed_files: number;
  /** The table being compared */
  table_name: string;
  /** Starting snapshot ID */
  from_snapshot_id: string;
  /** Ending snapshot ID */
  to_snapshot_id: string;
  /** Detailed file-level diff information */
  details: Record<string, unknown>[];
}

export interface ListSnapshotsParams {
  /** Name of the Iceberg table */
  table_name: string;
  /** Iceberg namespace */
  namespace: string;
  /** Maximum number of snapshots to return (default: 50, max: 1000) */
  limit?: number;
  /** Filter by document ID */
  document_id?: string;
}

export interface SnapshotInfo {
  /** Unique snapshot identifier */
  snapshot_id: string;
  /** Parent snapshot ID (null for first snapshot) */
  parent_id: string | null;
  /** Operation type (append, overwrite, delete, replace) */
  operation: string;
  /** ISO timestamp when snapshot was committed */
  committed_at: string;
  /** Summary statistics for the snapshot */
  summary: Record<string, string>;
  /** Path to the manifest list file */
  manifest_list: string;
}

export interface ListSnapshotsResponse {
  /** Array of snapshot information */
  snapshots: SnapshotInfo[];
  /** The table name */
  table_name: string;
  /** The namespace */
  namespace: string;
  /** Total number of snapshots available */
  total: number;
}

// ============================================================================
// Batch Upload Types
// ============================================================================

export interface BatchUploadOptions {
  /** Collection ID to add all documents to */
  collection_id?: string;
  /** Custom metadata to apply to all documents */
  metadata?: Record<string, unknown>;
}

export interface BatchUploadedDocument {
  /** Document ID */
  id: string;
  /** Document title */
  title: string;
  /** Content MIME type */
  content_type: string;
  /** Processing status */
  status: string;
  /** File size in bytes */
  size_bytes: number;
}

export interface BatchUploadResult {
  /** Array of uploaded document info */
  documents: BatchUploadedDocument[];
  /** Total number of documents uploaded */
  total_uploaded: number;
}

// ============================================================================
// Discovery Types
// ============================================================================

export interface ApiEndpoint {
  /** HTTP method */
  method: string;
  /** API path */
  path: string;
  /** Endpoint description */
  description: string;
  /** Required scopes */
  scopes: string[];
}

export interface RateLimitTier {
  /** Requests per minute */
  requests_per_minute: number;
  /** Search requests per minute */
  search_per_minute: number;
}

export interface DiscoveryInfo {
  /** API name */
  name: string;
  /** API version */
  version: string;
  /** API description */
  description: string;
  /** Base URL for API requests */
  base_url: string;
  /** Authentication information */
  authentication: {
    type: string;
    header: string;
    bearer_prefix: string;
    description: string;
    registration_url: string;
  };
  /** Documentation links */
  documentation: {
    openapi_spec: string;
    interactive_docs: string;
  };
  /** Available endpoints */
  endpoints: ApiEndpoint[];
  /** Rate limits by tier */
  rate_limits: {
    free: RateLimitTier;
    starter: RateLimitTier;
    professional: RateLimitTier;
    enterprise: RateLimitTier;
  };
  /** Available scopes */
  scopes: Record<string, string>;
}

// ============================================================================
// Error Types
// ============================================================================

export type ApiErrorType =
  | 'authentication_error'
  | 'authorization_error'
  | 'invalid_request_error'
  | 'not_found_error'
  | 'conflict_error'
  | 'quota_exceeded_error'
  | 'rate_limit_error'
  | 'server_error';

export interface ApiErrorResponse {
  error: {
    type: ApiErrorType;
    message: string;
    code: string;
    param?: string;
  };
  meta?: {
    request_id: string;
    timestamp: string;
  };
}
