# Lakehouse42 Node.js SDK

Official TypeScript SDK for the Lakehouse42 API. This SDK provides full TypeScript support, SSE streaming, automatic retries, and comprehensive error handling.

## Installation

```bash
npm install @lakehouse42/sdk
# or
pnpm add @lakehouse42/sdk
# or
yarn add @lakehouse42/sdk
```

## Quick Start

```typescript
import { Lakehouse } from '@lakehouse42/sdk';

const lakehouse = new Lakehouse({
  apiKey: process.env.LAKEHOUSE42_API_KEY!,
  // Optional: Custom base URL
  // baseUrl: 'https://api.your-domain.com',
});

// Create a document
const doc = await lakehouse.documents.create({
  title: 'Getting Started Guide',
  content: '# Introduction\n\nWelcome to our platform...',
  content_type: 'text/markdown',
});

// Search the knowledge base
const results = await lakehouse.search.query({
  query: 'How do I get started?',
  mode: 'hybrid',
  top_k: 10,
});

// Chat with RAG
const response = await lakehouse.search.chat({
  messages: [
    { role: 'user', content: 'What are the main features?' }
  ],
  include_sources: true,
});
```

## Configuration

```typescript
import { Lakehouse } from '@lakehouse42/sdk';

const lakehouse = new Lakehouse({
  // Required
  apiKey: 'your-api-key',

  // Optional
  baseUrl: 'https://api.lakehouse42.com', // Default API URL
  timeout: 30000, // Request timeout in ms (default: 30000)
  maxRetries: 3, // Number of retry attempts (default: 3)
  headers: { // Custom headers
    'X-Custom-Header': 'value',
  },
});
```

## Documents

### Create a Document

```typescript
const doc = await lakehouse.documents.create({
  title: 'API Documentation',
  content: 'This is the content of the document...',
  content_type: 'text/markdown', // 'text/plain' | 'text/markdown' | 'text/html'
  collection_id: 'collection-uuid', // Optional
  metadata: { version: '1.0' }, // Optional
  chunking_strategy: 'semantic', // 'semantic' | 'fixed' | 'paragraph'
});

console.log(doc.id, doc.status); // 'pending' -> 'processing' -> 'ready'
```

### Upload a File

```typescript
// In Node.js
import fs from 'fs';

const doc = await lakehouse.documents.upload({
  file: fs.readFileSync('document.pdf'),
  filename: 'document.pdf',
  title: 'My PDF Document',
  collection_id: 'collection-uuid',
});

// In browser
const doc = await lakehouse.documents.upload({
  file: fileInput.files[0], // File from input element
  title: 'Uploaded Document',
});
```

### Get a Document

```typescript
const doc = await lakehouse.documents.get('document-uuid');
console.log(doc.title, doc.chunk_count, doc.chunks);
```

### List Documents

```typescript
// Basic listing
const { documents, has_more, next_cursor, total_count } =
  await lakehouse.documents.list();

// With filters
const result = await lakehouse.documents.list({
  collection_id: 'collection-uuid',
  status: 'ready',
  search: 'api',
  limit: 20,
  cursor: 'previous-cursor',
});

// Async iteration (automatic pagination)
for await (const doc of lakehouse.documents.listAll({ status: 'ready' })) {
  console.log(doc.title);
}
```

### Update a Document

```typescript
const doc = await lakehouse.documents.update('document-uuid', {
  title: 'New Title',
  collection_id: 'new-collection-uuid',
  metadata: { updated: true },
});
```

### Delete a Document

```typescript
await lakehouse.documents.delete('document-uuid');
```

### Wait for Processing

```typescript
const doc = await lakehouse.documents.create({ ... });

// Wait for document to be ready
const readyDoc = await lakehouse.documents.waitForProcessing(doc.id, {
  timeout: 60000, // 60 seconds
  pollInterval: 2000, // Check every 2 seconds
});
```

## Collections

### Create a Collection

```typescript
const collection = await lakehouse.collections.create({
  name: 'Technical Docs',
  description: 'All technical documentation',
  color: '#3b82f6',
  icon: 'book',
  is_default: false,
  retrieval_config: {
    default_weights: { dense: 0.5, sparse: 0.3, bm25: 0.2 },
    reranking_enabled: true,
    top_k: { initial: 50, after_fusion: 20, final: 10 },
  },
});
```

### List Collections

```typescript
const { collections, has_more } = await lakehouse.collections.list();

// Async iteration
for await (const collection of lakehouse.collections.listAll()) {
  console.log(collection.name, collection.document_count);
}
```

### Get or Create

```typescript
const { collection, created } = await lakehouse.collections.getOrCreate(
  'My Collection',
  { description: 'Created if not exists' }
);
```

### Update a Collection

```typescript
const collection = await lakehouse.collections.update('collection-uuid', {
  name: 'Updated Name',
  is_default: true,
});
```

### Delete a Collection

```typescript
const result = await lakehouse.collections.delete('collection-uuid');
console.log(`Moved ${result.documents_moved_to_uncategorized} documents`);
```

## Search

### Basic Search

```typescript
const results = await lakehouse.search.query({
  query: 'How do I authenticate users?',
  mode: 'hybrid', // 'vector' | 'keyword' | 'hybrid'
  top_k: 10,
  min_score: 0.5,
  collection_ids: ['collection-uuid'],
  rerank: true,
  include_content: true,
  include_metadata: true,
});

for (const result of results.results) {
  console.log(result.document_title, result.score);
  console.log(result.content);
}
```

### Chat Completion with RAG

```typescript
const response = await lakehouse.search.chat({
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What are the pricing plans?' },
  ],
  model: 'gpt-4-turbo',
  temperature: 0.7,
  max_tokens: 1024,
  use_knowledge_base: true,
  search_top_k: 5,
  collection_ids: ['docs-collection'],
  include_sources: true,
});

console.log(response.choices[0].message.content);
if (response.sources) {
  console.log('Sources:', response.sources);
}
```

### Streaming Chat

```typescript
let fullContent = '';

await lakehouse.search.chatStream({
  messages: [{ role: 'user', content: 'Explain the architecture' }],
}, {
  onSources: (sources) => {
    console.log('Found sources:', sources.length);
  },
  onChunk: (chunk) => {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullContent += content;
      process.stdout.write(content);
    }
  },
  onDone: () => {
    console.log('\n\nStreaming complete');
  },
  onError: ({ error }) => {
    console.error('Error:', error);
  },
});
```

### Streaming RAG Search

```typescript
// Callback-based streaming
await lakehouse.search.stream({
  query: 'What are the system requirements?',
  collectionIds: ['docs-collection'],
  topK: 10,
}, {
  onSources: (event) => {
    console.log('Sources:', event.sources);
  },
  onContent: (event) => {
    process.stdout.write(event.content);
  },
  onMetadata: (event) => {
    console.log(`\nCompleted in ${event.latencyMs}ms`);
  },
  onComplete: (event) => {
    console.log('Query ID:', event.queryId);
  },
});

// Collect all results at once
const { sources, answer, metadata, queryId } =
  await lakehouse.search.streamCollect({
    query: 'How do I deploy?',
  });

// Async iterator
for await (const event of lakehouse.search.streamIterator({
  query: 'What is the pricing?',
})) {
  if (event.type === 'content') {
    process.stdout.write(event.content);
  }
}
```

## Knowledge Graph / Entities

### Get Knowledge Graph

```typescript
const graph = await lakehouse.entities.getGraph({
  limit: 100,
  documentId: 'document-uuid', // Optional: filter by document
});

console.log(`Nodes: ${graph.stats.totalNodes}`);
console.log(`Edges: ${graph.stats.totalEdges}`);

// Visualize
for (const node of graph.nodes) {
  console.log(`${node.type}: ${node.label}`);
}

for (const edge of graph.edges) {
  console.log(`${edge.source} --[${edge.label}]--> ${edge.target}`);
}
```

### Query Entities

```typescript
// Find by type
const people = await lakehouse.entities.findByType('person');
const concepts = await lakehouse.entities.findByType('concept');

// Find by label
const authEntities = await lakehouse.entities.findByLabel('authentication');

// Get neighbors
const neighbors = await lakehouse.entities.getNeighbors('entity-uuid');

// Find path between entities
const path = await lakehouse.entities.findPath('entity-1', 'entity-2');
if (path) {
  console.log('Path:', path.map(n => n.label).join(' -> '));
}

// Get statistics
const stats = await lakehouse.entities.getStats();
console.log('Nodes by type:', stats.nodesByType);
console.log('Edges by label:', stats.edgesByLabel);
```

## Error Handling

```typescript
import {
  Lakehouse,
  LakehouseApiError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  isRetryableError,
} from '@lakehouse42/sdk';

try {
  const doc = await lakehouse.documents.get('invalid-id');
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (error instanceof NotFoundError) {
    console.error('Document not found');
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limited. Retry after ${error.retryAfter}s`);
  } else if (error instanceof ValidationError) {
    console.error(`Invalid input: ${error.message}`);
  } else if (error instanceof LakehouseApiError) {
    console.error(`API error: ${error.type} - ${error.message}`);
    console.error(`Request ID: ${error.requestId}`);
  }

  // Check if error is retryable
  if (isRetryableError(error)) {
    // The SDK automatically retries, but you can implement custom logic
  }
}
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import type {
  Document,
  DocumentDetail,
  Collection,
  SearchResponse,
  SearchResult,
  ChatCompletionResponse,
  KnowledgeGraphResponse,
  EntityNode,
} from '@lakehouse42/sdk';

// All responses are fully typed
const doc: Document = await lakehouse.documents.create({ ... });
const results: SearchResponse = await lakehouse.search.query({ ... });
```

## Browser Support

The SDK works in both Node.js (18+) and modern browsers:

```typescript
// Browser usage (with bundler)
import { Lakehouse } from '@lakehouse42/sdk';

const lakehouse = new Lakehouse({
  apiKey: 'your-api-key',
});

// File upload from input
const input = document.querySelector('input[type="file"]');
input.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const doc = await lakehouse.documents.upload({ file });
});
```

## Cancellation

```typescript
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  await lakehouse.search.stream({
    query: 'Long query...',
  }, {
    signal: controller.signal,
    onContent: (event) => process.stdout.write(event.content),
  });
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request cancelled');
  }
}
```

## License

MIT
