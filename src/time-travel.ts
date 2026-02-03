/**
 * Lakehouse42 SDK - Time Travel Operations
 */

import type { Lakehouse } from './client';
import type {
  TimeTravelQueryParams,
  TimeTravelQueryResult,
  TimeTravelDiffParams,
  DiffResult,
  ListSnapshotsParams,
  ListSnapshotsResponse,
} from './types';
import { ValidationError } from './errors';

/**
 * Time travel operations for the Lakehouse42 API.
 * Enables querying historical data via Iceberg snapshots.
 */
export class TimeTravel {
  private readonly client: Lakehouse;

  constructor(client: Lakehouse) {
    this.client = client;
  }

  /**
   * Query an Iceberg table at a specific point in time.
   *
   * @example
   * ```typescript
   * // Query by snapshot ID
   * const result = await lakehouse.timeTravel.query({
   *   table_name: 'documents',
   *   namespace: 'org_abc123',
   *   snapshot_id: '1234567890123456789',
   *   columns: ['id', 'title', 'created_at'],
   *   limit: 100,
   * });
   *
   * // Query by timestamp
   * const result = await lakehouse.timeTravel.query({
   *   table_name: 'chunks',
   *   namespace: 'org_abc123',
   *   as_of_timestamp: '2024-01-15T10:30:00Z',
   *   where: "document_id = 'doc-123'",
   *   limit: 50,
   * });
   *
   * console.log(`Found ${result.row_count} rows`);
   * for (const row of result.rows) {
   *   console.log(row);
   * }
   * ```
   */
  async query(params: TimeTravelQueryParams): Promise<TimeTravelQueryResult> {
    if (!params.table_name) {
      throw new ValidationError('Table name is required', 'missing_table_name', 'table_name');
    }
    if (!params.namespace) {
      throw new ValidationError('Namespace is required', 'missing_namespace', 'namespace');
    }

    return this.client.request<TimeTravelQueryResult>('/api/v1/time-travel/query', {
      method: 'POST',
      body: {
        table_name: params.table_name,
        namespace: params.namespace,
        snapshot_id: params.snapshot_id,
        as_of_timestamp: params.as_of_timestamp,
        query: params.query,
        columns: params.columns,
        where: params.where,
        limit: params.limit ?? 100,
      },
    });
  }

  /**
   * Compare two Iceberg snapshots and return the differences.
   *
   * @example
   * ```typescript
   * const diff = await lakehouse.timeTravel.diff({
   *   table_name: 'documents',
   *   namespace: 'org_abc123',
   *   from_snapshot_id: '1234567890',
   *   to_snapshot_id: '1234567891',
   * });
   *
   * console.log(`Added: ${diff.added_rows}, Deleted: ${diff.deleted_rows}`);
   * console.log(`Changed files: ${diff.changed_files}`);
   *
   * if (diff.schema_changes.length > 0) {
   *   console.log('Schema changes:', diff.schema_changes);
   * }
   * ```
   */
  async diff(params: TimeTravelDiffParams): Promise<DiffResult> {
    if (!params.table_name) {
      throw new ValidationError('Table name is required', 'missing_table_name', 'table_name');
    }
    if (!params.namespace) {
      throw new ValidationError('Namespace is required', 'missing_namespace', 'namespace');
    }
    if (!params.from_snapshot_id) {
      throw new ValidationError('From snapshot ID is required', 'missing_from_snapshot_id', 'from_snapshot_id');
    }
    if (!params.to_snapshot_id) {
      throw new ValidationError('To snapshot ID is required', 'missing_to_snapshot_id', 'to_snapshot_id');
    }

    return this.client.request<DiffResult>('/api/v1/time-travel/diff', {
      method: 'POST',
      body: {
        table_name: params.table_name,
        namespace: params.namespace,
        from_snapshot_id: params.from_snapshot_id,
        to_snapshot_id: params.to_snapshot_id,
      },
    });
  }

  /**
   * List snapshots for an Iceberg table.
   *
   * @example
   * ```typescript
   * const { snapshots, total } = await lakehouse.timeTravel.listSnapshots({
   *   table_name: 'documents',
   *   namespace: 'org_abc123',
   *   limit: 10,
   * });
   *
   * console.log(`Found ${total} snapshots`);
   * for (const snapshot of snapshots) {
   *   console.log(`${snapshot.snapshot_id} - ${snapshot.operation} at ${snapshot.committed_at}`);
   * }
   * ```
   */
  async listSnapshots(params: ListSnapshotsParams): Promise<ListSnapshotsResponse> {
    if (!params.table_name) {
      throw new ValidationError('Table name is required', 'missing_table_name', 'table_name');
    }
    if (!params.namespace) {
      throw new ValidationError('Namespace is required', 'missing_namespace', 'namespace');
    }

    const searchParams = new URLSearchParams();
    searchParams.set('table_name', params.table_name);
    searchParams.set('namespace', params.namespace);

    if (params.limit !== undefined) {
      searchParams.set('limit', String(params.limit));
    }
    if (params.document_id) {
      searchParams.set('document_id', params.document_id);
    }

    const queryString = searchParams.toString();
    const path = `/api/v1/time-travel/snapshots?${queryString}`;

    return this.client.request<ListSnapshotsResponse>(path);
  }

  /**
   * Get a specific snapshot by ID.
   *
   * @example
   * ```typescript
   * const snapshots = await lakehouse.timeTravel.listSnapshots({
   *   table_name: 'documents',
   *   namespace: 'org_abc123',
   * });
   *
   * const latestSnapshot = snapshots.snapshots[0];
   * console.log('Latest snapshot:', latestSnapshot.snapshot_id);
   * ```
   */
  async getLatestSnapshot(params: { table_name: string; namespace: string }): Promise<SnapshotInfo | null> {
    const result = await this.listSnapshots({
      table_name: params.table_name,
      namespace: params.namespace,
      limit: 1,
    });

    return result.snapshots[0] ?? null;
  }
}

// Re-export type for convenience
import type { SnapshotInfo } from './types';
