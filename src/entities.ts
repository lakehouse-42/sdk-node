/**
 * Lakehouse42 SDK - Entity/Knowledge Graph Operations
 */

import type { Lakehouse } from './client';
import type {
  KnowledgeGraphResponse,
  GetKnowledgeGraphParams,
  EntityNode,
  EntityEdge,
} from './types';

/**
 * Entity and knowledge graph operations for the Lakehouse42 API
 */
export class Entities {
  private readonly client: Lakehouse;

  constructor(client: Lakehouse) {
    this.client = client;
  }

  /**
   * Get the knowledge graph for the organization
   *
   * @example
   * ```typescript
   * // Get full knowledge graph (up to 100 nodes)
   * const graph = await lakehouse.entities.getGraph();
   * console.log(`Nodes: ${graph.stats.totalNodes}, Edges: ${graph.stats.totalEdges}`);
   *
   * // Get knowledge graph for a specific document
   * const docGraph = await lakehouse.entities.getGraph({
   *   documentId: 'document-uuid',
   *   limit: 50,
   * });
   *
   * // Visualize the graph
   * for (const node of graph.nodes) {
   *   console.log(`${node.type}: ${node.label}`);
   * }
   *
   * for (const edge of graph.edges) {
   *   console.log(`${edge.source} --[${edge.label}]--> ${edge.target}`);
   * }
   * ```
   */
  async getGraph(params: GetKnowledgeGraphParams = {}): Promise<KnowledgeGraphResponse> {
    const searchParams = new URLSearchParams();

    if (params.limit !== undefined) {
      searchParams.set('limit', String(params.limit));
    }
    if (params.documentId) {
      searchParams.set('documentId', params.documentId);
    }

    const queryString = searchParams.toString();
    const path = `/api/knowledge-graph${queryString ? `?${queryString}` : ''}`;

    return this.client.request<KnowledgeGraphResponse>(path);
  }

  /**
   * Get all nodes in the knowledge graph
   *
   * @example
   * ```typescript
   * const nodes = await lakehouse.entities.getNodes({ limit: 200 });
   * const people = nodes.filter(n => n.type === 'person');
   * ```
   */
  async getNodes(params: GetKnowledgeGraphParams = {}): Promise<EntityNode[]> {
    const graph = await this.getGraph(params);
    return graph.nodes;
  }

  /**
   * Get all edges in the knowledge graph
   *
   * @example
   * ```typescript
   * const edges = await lakehouse.entities.getEdges();
   * const strongEdges = edges.filter(e => e.weight > 0.8);
   * ```
   */
  async getEdges(params: GetKnowledgeGraphParams = {}): Promise<EntityEdge[]> {
    const graph = await this.getGraph(params);
    return graph.edges;
  }

  /**
   * Find nodes by type
   *
   * @example
   * ```typescript
   * const people = await lakehouse.entities.findByType('person');
   * const concepts = await lakehouse.entities.findByType('concept');
   * ```
   */
  async findByType(
    type: EntityNode['type'],
    params: GetKnowledgeGraphParams = {}
  ): Promise<EntityNode[]> {
    const nodes = await this.getNodes(params);
    return nodes.filter((node) => node.type === type);
  }

  /**
   * Find nodes by label (case-insensitive search)
   *
   * @example
   * ```typescript
   * const results = await lakehouse.entities.findByLabel('authentication');
   * ```
   */
  async findByLabel(
    label: string,
    params: GetKnowledgeGraphParams = {}
  ): Promise<EntityNode[]> {
    const nodes = await this.getNodes(params);
    const lowerLabel = label.toLowerCase();
    return nodes.filter((node) => node.label.toLowerCase().includes(lowerLabel));
  }

  /**
   * Get edges connected to a specific node
   *
   * @example
   * ```typescript
   * const nodeId = 'entity-uuid';
   * const connectedEdges = await lakehouse.entities.getConnectedEdges(nodeId);
   *
   * const incoming = connectedEdges.filter(e => e.target === nodeId);
   * const outgoing = connectedEdges.filter(e => e.source === nodeId);
   * ```
   */
  async getConnectedEdges(
    nodeId: string,
    params: GetKnowledgeGraphParams = {}
  ): Promise<EntityEdge[]> {
    const edges = await this.getEdges(params);
    return edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
  }

  /**
   * Get neighboring nodes for a specific node
   *
   * @example
   * ```typescript
   * const neighbors = await lakehouse.entities.getNeighbors('entity-uuid');
   * console.log(`Found ${neighbors.length} connected entities`);
   * ```
   */
  async getNeighbors(
    nodeId: string,
    params: GetKnowledgeGraphParams = {}
  ): Promise<EntityNode[]> {
    const graph = await this.getGraph(params);

    // Find all connected node IDs
    const neighborIds = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.source === nodeId) {
        neighborIds.add(edge.target);
      }
      if (edge.target === nodeId) {
        neighborIds.add(edge.source);
      }
    }

    // Return the corresponding nodes
    return graph.nodes.filter((node) => neighborIds.has(node.id));
  }

  /**
   * Get a subgraph containing only specified node IDs and edges between them
   *
   * @example
   * ```typescript
   * const nodeIds = ['entity-1', 'entity-2', 'entity-3'];
   * const subgraph = await lakehouse.entities.getSubgraph(nodeIds);
   * ```
   */
  async getSubgraph(nodeIds: string[]): Promise<KnowledgeGraphResponse> {
    const graph = await this.getGraph({ limit: 500 });

    const nodeIdSet = new Set(nodeIds);
    const nodes = graph.nodes.filter((node) => nodeIdSet.has(node.id));
    const edges = graph.edges.filter(
      (edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)
    );

    // Calculate stats for subgraph
    const connectionCounts = new Map<string, number>();
    for (const edge of edges) {
      connectionCounts.set(edge.source, (connectionCounts.get(edge.source) || 0) + 1);
      connectionCounts.set(edge.target, (connectionCounts.get(edge.target) || 0) + 1);
    }

    const avgConnections =
      nodes.length > 0
        ? Array.from(connectionCounts.values()).reduce((a, b) => a + b, 0) / nodes.length
        : 0;

    return {
      nodes,
      edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        avgConnections: Math.round(avgConnections * 100) / 100,
      },
    };
  }

  /**
   * Get entities for a specific document
   *
   * @example
   * ```typescript
   * const docEntities = await lakehouse.entities.getForDocument('document-uuid');
   * ```
   */
  async getForDocument(documentId: string): Promise<KnowledgeGraphResponse> {
    return this.getGraph({ documentId });
  }

  /**
   * Find the shortest path between two nodes (if one exists)
   *
   * @example
   * ```typescript
   * const path = await lakehouse.entities.findPath('entity-1', 'entity-2');
   * if (path) {
   *   console.log('Path found:', path.map(n => n.label).join(' -> '));
   * }
   * ```
   */
  async findPath(
    sourceId: string,
    targetId: string,
    params: GetKnowledgeGraphParams = {}
  ): Promise<EntityNode[] | null> {
    const graph = await this.getGraph(params);

    // Build adjacency list
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
      if (!adjacency.has(edge.source)) {
        adjacency.set(edge.source, []);
      }
      if (!adjacency.has(edge.target)) {
        adjacency.set(edge.target, []);
      }
      adjacency.get(edge.source)!.push(edge.target);
      adjacency.get(edge.target)!.push(edge.source); // Undirected traversal
    }

    // BFS to find shortest path
    const visited = new Set<string>();
    const queue: { nodeId: string; path: string[] }[] = [{ nodeId: sourceId, path: [sourceId] }];
    visited.add(sourceId);

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;

      if (nodeId === targetId) {
        // Convert IDs to nodes
        const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
        return path.map((id) => nodeMap.get(id)!).filter(Boolean);
      }

      const neighbors = adjacency.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ nodeId: neighbor, path: [...path, neighbor] });
        }
      }
    }

    return null; // No path found
  }

  /**
   * Get graph statistics
   *
   * @example
   * ```typescript
   * const stats = await lakehouse.entities.getStats();
   * console.log(`Graph has ${stats.totalNodes} nodes and ${stats.totalEdges} edges`);
   * ```
   */
  async getStats(params: GetKnowledgeGraphParams = {}): Promise<{
    totalNodes: number;
    totalEdges: number;
    avgConnections: number;
    nodesByType: Record<string, number>;
    edgesByLabel: Record<string, number>;
  }> {
    const graph = await this.getGraph(params);

    // Count nodes by type
    const nodesByType: Record<string, number> = {};
    for (const node of graph.nodes) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }

    // Count edges by label
    const edgesByLabel: Record<string, number> = {};
    for (const edge of graph.edges) {
      edgesByLabel[edge.label] = (edgesByLabel[edge.label] || 0) + 1;
    }

    return {
      ...graph.stats,
      nodesByType,
      edgesByLabel,
    };
  }
}
