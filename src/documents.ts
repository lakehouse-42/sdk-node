/**
 * Lakehouse42 SDK - Document Operations
 */

import type { Lakehouse } from './client';
import type {
  Document,
  DocumentDetail,
  CreateDocumentParams,
  UpdateDocumentParams,
  ListDocumentsParams,
  ListDocumentsResponse,
  UploadDocumentParams,
  UploadDocumentResponse,
  DeleteResponse,
  BatchUploadOptions,
  BatchUploadResult,
} from './types';
import { ValidationError } from './errors';

/**
 * Document operations for the Lakehouse42 API
 */
export class Documents {
  private readonly client: Lakehouse;

  constructor(client: Lakehouse) {
    this.client = client;
  }

  /**
   * Create a document from text content
   *
   * @example
   * ```typescript
   * const doc = await lakehouse.documents.create({
   *   title: 'My Document',
   *   content: 'This is the content of my document.',
   *   content_type: 'text/markdown',
   *   collection_id: 'collection-uuid',
   * });
   * ```
   */
  async create(params: CreateDocumentParams): Promise<Document> {
    if (!params.content) {
      throw new ValidationError('Content is required', 'missing_content', 'content');
    }
    if (!params.title) {
      throw new ValidationError('Title is required', 'missing_title', 'title');
    }

    return this.client.request<Document>('/api/v1/documents', {
      method: 'POST',
      body: {
        content: params.content,
        title: params.title,
        content_type: params.content_type ?? 'text/plain',
        collection_id: params.collection_id,
        metadata: params.metadata ?? {},
        chunking_strategy: params.chunking_strategy,
      },
    });
  }

  /**
   * Upload a document file
   *
   * @example
   * ```typescript
   * // In Node.js
   * const doc = await lakehouse.documents.upload({
   *   file: fs.readFileSync('document.pdf'),
   *   filename: 'document.pdf',
   *   title: 'My PDF Document',
   * });
   *
   * // In browser
   * const doc = await lakehouse.documents.upload({
   *   file: fileInput.files[0],
   *   title: 'Uploaded Document',
   * });
   * ```
   */
  async upload(params: UploadDocumentParams): Promise<UploadDocumentResponse> {
    const formData = new FormData();

    // Handle different file types
    if (params.file instanceof Buffer) {
      if (!params.filename) {
        throw new ValidationError('Filename is required when uploading a Buffer', 'missing_filename', 'filename');
      }
      // Convert Buffer to ArrayBuffer for Blob compatibility
      const arrayBuffer = params.file.buffer.slice(
        params.file.byteOffset,
        params.file.byteOffset + params.file.byteLength
      ) as ArrayBuffer;
      const blob = new Blob([arrayBuffer]);
      formData.append('file', blob, params.filename);
    } else if (params.file instanceof Blob) {
      const filename = params.filename || (params.file as File).name || 'document';
      formData.append('file', params.file, filename);
    } else {
      throw new ValidationError('Invalid file type. Expected File, Blob, or Buffer.', 'invalid_file', 'file');
    }

    // Add optional fields
    if (params.title) {
      formData.append('title', params.title);
    }
    if (params.collection_id) {
      formData.append('collection_id', params.collection_id);
    }
    if (params.metadata) {
      formData.append('metadata', JSON.stringify(params.metadata));
    }

    return this.client.request<UploadDocumentResponse>('/api/v1/documents/upload', {
      method: 'POST',
      body: formData,
    });
  }

  /**
   * Get a document by ID
   *
   * @example
   * ```typescript
   * const doc = await lakehouse.documents.get('document-uuid');
   * console.log(doc.title, doc.chunks);
   * ```
   */
  async get(documentId: string): Promise<DocumentDetail> {
    if (!documentId) {
      throw new ValidationError('Document ID is required', 'missing_document_id', 'documentId');
    }

    return this.client.request<DocumentDetail>(`/api/v1/documents/${documentId}`);
  }

  /**
   * List documents with optional filters
   *
   * @example
   * ```typescript
   * // List all documents
   * const { documents, has_more, next_cursor } = await lakehouse.documents.list();
   *
   * // List documents in a collection
   * const result = await lakehouse.documents.list({
   *   collection_id: 'collection-uuid',
   *   status: 'ready',
   *   limit: 20,
   * });
   *
   * // Paginate through results
   * let cursor = null;
   * do {
   *   const { documents, next_cursor } = await lakehouse.documents.list({
   *     cursor,
   *     limit: 50,
   *   });
   *   processDocuments(documents);
   *   cursor = next_cursor;
   * } while (cursor);
   * ```
   */
  async list(params: ListDocumentsParams = {}): Promise<ListDocumentsResponse> {
    const searchParams = new URLSearchParams();

    if (params.limit !== undefined) {
      searchParams.set('limit', String(params.limit));
    }
    if (params.cursor) {
      searchParams.set('cursor', params.cursor);
    }
    if (params.collection_id !== undefined) {
      searchParams.set('collection_id', params.collection_id === null ? 'null' : params.collection_id);
    }
    if (params.status) {
      searchParams.set('status', params.status);
    }
    if (params.search) {
      searchParams.set('search', params.search);
    }

    const queryString = searchParams.toString();
    const path = `/api/v1/documents${queryString ? `?${queryString}` : ''}`;

    return this.client.request<ListDocumentsResponse>(path);
  }

  /**
   * Update a document's metadata
   *
   * @example
   * ```typescript
   * const doc = await lakehouse.documents.update('document-uuid', {
   *   title: 'New Title',
   *   collection_id: 'new-collection-uuid',
   *   metadata: { tags: ['important'] },
   * });
   * ```
   */
  async update(documentId: string, params: UpdateDocumentParams): Promise<Document> {
    if (!documentId) {
      throw new ValidationError('Document ID is required', 'missing_document_id', 'documentId');
    }

    if (Object.keys(params).length === 0) {
      throw new ValidationError('At least one field to update is required', 'no_updates');
    }

    return this.client.request<Document>(`/api/v1/documents/${documentId}`, {
      method: 'PATCH',
      body: params,
    });
  }

  /**
   * Delete a document
   *
   * @example
   * ```typescript
   * await lakehouse.documents.delete('document-uuid');
   * ```
   */
  async delete(documentId: string): Promise<DeleteResponse> {
    if (!documentId) {
      throw new ValidationError('Document ID is required', 'missing_document_id', 'documentId');
    }

    return this.client.request<DeleteResponse>(`/api/v1/documents/${documentId}`, {
      method: 'DELETE',
    });
  }

  /**
   * List all documents using async iteration
   *
   * @example
   * ```typescript
   * for await (const doc of lakehouse.documents.listAll({ status: 'ready' })) {
   *   console.log(doc.title);
   * }
   * ```
   */
  async *listAll(params: Omit<ListDocumentsParams, 'cursor'> = {}): AsyncGenerator<Document> {
    let cursor: string | null = null;

    do {
      const response = await this.list({ ...params, cursor: cursor || undefined });

      for (const doc of response.documents) {
        yield doc;
      }

      cursor = response.next_cursor;
    } while (cursor);
  }

  /**
   * Wait for a document to finish processing
   *
   * @example
   * ```typescript
   * const doc = await lakehouse.documents.create({ ... });
   * const readyDoc = await lakehouse.documents.waitForProcessing(doc.id, {
   *   timeout: 60000,
   *   pollInterval: 2000,
   * });
   * ```
   */
  async waitForProcessing(
    documentId: string,
    options: { timeout?: number; pollInterval?: number } = {}
  ): Promise<DocumentDetail> {
    const { timeout = 120000, pollInterval = 3000 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const doc = await this.get(documentId);

      if (doc.status === 'ready') {
        return doc;
      }

      if (doc.status === 'failed') {
        throw new Error(`Document processing failed: ${doc.processing_error || 'Unknown error'}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Timed out waiting for document processing after ${timeout}ms`);
  }

  /**
   * Upload multiple document files in a single batch request
   *
   * @example
   * ```typescript
   * // In Node.js with file system
   * const files = [
   *   new File([fs.readFileSync('doc1.pdf')], 'doc1.pdf', { type: 'application/pdf' }),
   *   new File([fs.readFileSync('doc2.docx')], 'doc2.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
   * ];
   *
   * const result = await lakehouse.documents.uploadBatch(files, {
   *   collection_id: 'collection-uuid',
   *   metadata: { project: 'Q4 Reports' },
   * });
   *
   * console.log(`Uploaded ${result.total_uploaded} documents`);
   * for (const doc of result.documents) {
   *   console.log(`  - ${doc.title} (${doc.status})`);
   * }
   *
   * // In browser with FileList
   * const fileInput = document.getElementById('files') as HTMLInputElement;
   * const result = await lakehouse.documents.uploadBatch(
   *   Array.from(fileInput.files || []),
   *   { collection_id: 'collection-uuid' }
   * );
   * ```
   *
   * @param files - Array of files to upload (max 10 files, max 50MB each)
   * @param options - Optional settings for all documents
   * @throws {ValidationError} If no files provided or more than 10 files
   */
  async uploadBatch(
    files: (File | Blob)[],
    options: BatchUploadOptions = {}
  ): Promise<BatchUploadResult> {
    if (!files || files.length === 0) {
      throw new ValidationError('At least one file is required', 'missing_files', 'files');
    }

    if (files.length > 10) {
      throw new ValidationError('Maximum 10 files per batch upload', 'too_many_files', 'files');
    }

    const formData = new FormData();

    // Add all files
    for (const file of files) {
      if (file instanceof Blob) {
        const filename = (file as File).name || 'document';
        formData.append('files', file, filename);
      } else {
        throw new ValidationError('Invalid file type. Expected File or Blob.', 'invalid_file', 'files');
      }
    }

    // Add optional fields
    if (options.collection_id) {
      formData.append('collection_id', options.collection_id);
    }
    if (options.metadata) {
      formData.append('metadata', JSON.stringify(options.metadata));
    }

    return this.client.request<BatchUploadResult>('/api/v1/documents/upload/batch', {
      method: 'POST',
      body: formData,
    });
  }

  /**
   * Upload multiple documents and wait for them all to finish processing
   *
   * @example
   * ```typescript
   * const files = [file1, file2, file3];
   * const docs = await lakehouse.documents.uploadBatchAndWait(files, {
   *   collection_id: 'collection-uuid',
   * }, {
   *   timeout: 300000, // 5 minutes
   *   pollInterval: 5000,
   * });
   *
   * console.log('All documents processed:', docs.map(d => d.title));
   * ```
   */
  async uploadBatchAndWait(
    files: (File | Blob)[],
    options: BatchUploadOptions = {},
    waitOptions: { timeout?: number; pollInterval?: number } = {}
  ): Promise<DocumentDetail[]> {
    const result = await this.uploadBatch(files, options);

    const processedDocs = await Promise.all(
      result.documents.map((doc) => this.waitForProcessing(doc.id, waitOptions))
    );

    return processedDocs;
  }
}
