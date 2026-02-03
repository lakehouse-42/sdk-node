/**
 * Lakehouse42 SDK - Collection Operations
 */

import type { Lakehouse } from './client';
import type {
  Collection,
  CreateCollectionParams,
  UpdateCollectionParams,
  ListCollectionsResponse,
  DeleteCollectionResponse,
  PaginationParams,
} from './types';
import { ValidationError } from './errors';

/**
 * Collection operations for the Lakehouse42 API
 */
export class Collections {
  private readonly client: Lakehouse;

  constructor(client: Lakehouse) {
    this.client = client;
  }

  /**
   * Create a new collection
   *
   * @example
   * ```typescript
   * const collection = await lakehouse.collections.create({
   *   name: 'Technical Documentation',
   *   description: 'All technical docs and guides',
   *   color: '#3b82f6',
   *   icon: 'book',
   *   retrieval_config: {
   *     default_weights: { dense: 0.5, sparse: 0.3, bm25: 0.2 },
   *     reranking_enabled: true,
   *   },
   * });
   * ```
   */
  async create(params: CreateCollectionParams): Promise<Collection> {
    if (!params.name) {
      throw new ValidationError('Name is required', 'missing_name', 'name');
    }

    return this.client.request<Collection>('/api/v1/collections', {
      method: 'POST',
      body: {
        name: params.name,
        description: params.description,
        color: params.color ?? '#6366f1',
        icon: params.icon ?? 'folder',
        is_default: params.is_default ?? false,
        retrieval_config: params.retrieval_config,
        metadata_schema: params.metadata_schema,
      },
    });
  }

  /**
   * Get a collection by ID
   *
   * @example
   * ```typescript
   * const collection = await lakehouse.collections.get('collection-uuid');
   * console.log(collection.name, collection.document_count);
   * ```
   */
  async get(collectionId: string): Promise<Collection> {
    if (!collectionId) {
      throw new ValidationError('Collection ID is required', 'missing_collection_id', 'collectionId');
    }

    return this.client.request<Collection>(`/api/v1/collections/${collectionId}`);
  }

  /**
   * List all collections
   *
   * @example
   * ```typescript
   * const { collections, has_more } = await lakehouse.collections.list();
   *
   * // With pagination
   * const result = await lakehouse.collections.list({
   *   limit: 20,
   *   cursor: 'previous-cursor',
   * });
   * ```
   */
  async list(params: PaginationParams = {}): Promise<ListCollectionsResponse> {
    const searchParams = new URLSearchParams();

    if (params.limit !== undefined) {
      searchParams.set('limit', String(params.limit));
    }
    if (params.cursor) {
      searchParams.set('cursor', params.cursor);
    }

    const queryString = searchParams.toString();
    const path = `/api/v1/collections${queryString ? `?${queryString}` : ''}`;

    return this.client.request<ListCollectionsResponse>(path);
  }

  /**
   * Update a collection
   *
   * @example
   * ```typescript
   * const collection = await lakehouse.collections.update('collection-uuid', {
   *   name: 'Updated Name',
   *   description: 'New description',
   *   is_default: true,
   * });
   * ```
   */
  async update(collectionId: string, params: UpdateCollectionParams): Promise<Collection> {
    if (!collectionId) {
      throw new ValidationError('Collection ID is required', 'missing_collection_id', 'collectionId');
    }

    if (Object.keys(params).length === 0) {
      throw new ValidationError('At least one field to update is required', 'no_updates');
    }

    return this.client.request<Collection>(`/api/v1/collections/${collectionId}`, {
      method: 'PATCH',
      body: params,
    });
  }

  /**
   * Delete a collection
   *
   * Documents in the collection are moved to uncategorized.
   *
   * @example
   * ```typescript
   * const result = await lakehouse.collections.delete('collection-uuid');
   * console.log(`Moved ${result.documents_moved_to_uncategorized} documents`);
   * ```
   */
  async delete(collectionId: string): Promise<DeleteCollectionResponse> {
    if (!collectionId) {
      throw new ValidationError('Collection ID is required', 'missing_collection_id', 'collectionId');
    }

    return this.client.request<DeleteCollectionResponse>(`/api/v1/collections/${collectionId}`, {
      method: 'DELETE',
    });
  }

  /**
   * List all collections using async iteration
   *
   * @example
   * ```typescript
   * for await (const collection of lakehouse.collections.listAll()) {
   *   console.log(collection.name);
   * }
   * ```
   */
  async *listAll(params: Omit<PaginationParams, 'cursor'> = {}): AsyncGenerator<Collection> {
    let cursor: string | null = null;

    do {
      const response = await this.list({ ...params, cursor: cursor || undefined });

      for (const collection of response.collections) {
        yield collection;
      }

      cursor = response.next_cursor;
    } while (cursor);
  }

  /**
   * Get or create a collection by name
   *
   * @example
   * ```typescript
   * const collection = await lakehouse.collections.getOrCreate('My Collection', {
   *   description: 'Created if not exists',
   * });
   * ```
   */
  async getOrCreate(
    name: string,
    createParams: Omit<CreateCollectionParams, 'name'> = {}
  ): Promise<{ collection: Collection; created: boolean }> {
    // List collections to find by name
    const response = await this.list({ limit: 100 });

    for (const collection of response.collections) {
      if (collection.name === name) {
        return { collection, created: false };
      }
    }

    // If we have more pages, we need to paginate
    if (response.has_more) {
      for await (const collection of this.listAll()) {
        if (collection.name === name) {
          return { collection, created: false };
        }
      }
    }

    // Create the collection
    const collection = await this.create({ name, ...createParams });
    return { collection, created: true };
  }
}
