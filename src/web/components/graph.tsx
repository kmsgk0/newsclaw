import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { GraphData } from "../types";
import { Empty, Tabs } from "./ui";

interface GraphGroup {
  id: string;
  label: string;
  nodes: GraphData['nodes'];
}

function connectedGroups(graph: GraphData): GraphGroup[] {
  const adjacency = new Map(
    graph.nodes.map((node) => [node.id, new Set<string>()]),
  );
  graph.edges.forEach((edge) => {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });
  const remaining = new Set(graph.nodes.map((node) => node.id));
  const groups: GraphGroup[] = [];
  while (remaining.size) {
    const root = [...remaining].sort(
      (a, b) => adjacency.get(b)!.size - adjacency.get(a)!.size,
    )[0];
    const queue = [root];
    const ids: string[] = [];
    remaining.delete(root);
    while (queue.length) {
      const id = queue.shift()!;
      ids.push(id);
      for (const neighbor of adjacency.get(id) ?? [])
        if (remaining.delete(neighbor)) queue.push(neighbor);
    }
    groups.push({
      id: root,
      label: graph.nodes.find((node) => node.id === root)!.label,
      nodes: ids.map((id) => graph.nodes.find((node) => node.id === id)!),
    });
  }
  return groups.sort(
    (a, b) => b.nodes.length - a.nodes.length || a.label.localeCompare(b.label),
  );
}

function packedPositions(groups: GraphGroup[]) {
  const result = new Map<string, { x: number; y: number }>();
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const group of groups) {
    const columns = Math.min(
      group.nodes.length,
      4,
      Math.ceil(Math.sqrt(group.nodes.length * 1.4)),
    );
    const rows = Math.ceil(group.nodes.length / columns);
    const width = columns * 230 - 50;
    const height = rows * 112 - 36;
    if (x > 0 && x + width > 1840) {
      x = 0;
      y += rowHeight + 64;
      rowHeight = 0;
    }
    group.nodes.forEach((node, index) =>
      result.set(node.id, {
        x: x + (index % columns) * 230,
        y: y + Math.floor(index / columns) * 112,
      }),
    );
    x += width + 72;
    rowHeight = Math.max(rowHeight, height);
  }
  return result;
}

export function GraphView({ graph }: { graph: GraphData }) {
  const [view, setView] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 767px)').matches
      ? 'list'
      : 'graph',
  );
  const [scope, setScope] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    type: 'node' | 'edge';
    id: string;
  } | null>(null);
  const groups = useMemo(() => connectedGroups(graph), [graph]);
  const currentScope =
    scope === 'all'
      ? 'all'
      : groups.some((group) => group.id === scope)
        ? scope!
        : (groups.find((group) => group.nodes.length > 1)?.id ?? 'all');
  const visibleGroups =
    currentScope === 'all'
      ? groups
      : groups.filter((group) => group.id === currentScope);
  const visibleNodes = visibleGroups.flatMap((group) => group.nodes);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );
  const layout = packedPositions(visibleGroups);
  const related = new Set(
    selected?.type === 'node'
      ? graph.edges
          .filter(
            (edge) =>
              edge.source === selected.id || edge.target === selected.id,
          )
          .map((edge) => edge.id)
      : selected?.type === 'edge'
        ? [selected.id]
        : [],
  );
  const nodes: Node[] = visibleNodes.map((node) => ({
    id: node.id,
    position: layout.get(node.id)!,
    data: { label: node.label },
    style: {
      width: 180,
      minHeight: 72,
      padding: '14px 16px',
      background: '#fff',
      color: '#344d74',
      border: `1.5px solid ${selected?.type === 'node' && selected.id === node.id ? '#2458ca' : '#c8d5e8'}`,
      borderRadius: 8,
      fontSize: 14,
      lineHeight: 1.5,
    },
  }));
  const edges: Edge[] = visibleEdges.map((edge) => ({
    ...edge,
    label: '',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: {
      stroke: related.has(edge.id) ? '#2458ca' : '#a9bdd9',
      strokeWidth: related.has(edge.id) ? 2.4 : 1,
      opacity: selected && !related.has(edge.id) ? 0.25 : 1,
    },
  }));
  if (!graph.nodes.length)
    return (
      <Empty title="尚无可展示的关系">
        相关报道中的实体与关系整理完成后，会显示在这里。
      </Empty>
    );
  const item =
    selected?.type === 'node'
      ? graph.nodes.find((node) => node.id === selected.id)
      : graph.edges.find((edge) => edge.id === selected?.id);
  const relation = (edge: GraphData['edges'][number]) => (
    <article key={edge.id}>
      <button
        className="relation-label"
        onClick={() => setSelected({ type: 'edge', id: edge.id })}
      >
        <strong>
          {graph.nodes.find((node) => node.id === edge.source)?.label}
        </strong>
        <span>{edge.label}</span>
        <strong>
          {graph.nodes.find((node) => node.id === edge.target)?.label}
        </strong>
      </button>
      <div className="inline-links">
        {edge.sourceIds.map((id, index) => (
          <Link to={`/news/${id}`} key={id}>
            依据报道 {index + 1}
          </Link>
        ))}
      </div>
    </article>
  );
  return (
    <div className="graph-view">
      <div className="graph-heading">
        <span className="muted">
          {graph.nodes.length} 个对象 · {graph.edges.length} 条关系
        </span>
        <Tabs
          value={view}
          options={[
            { value: 'graph', label: '图形' },
            { value: 'list', label: '关系列表' },
          ]}
          onChange={setView}
        />
      </div>
      {view === 'graph' ? (
        <>
          <div className="graph-scope">
            <label htmlFor="graph-scope">图形范围</label>
            <select
              id="graph-scope"
              value={currentScope}
              onChange={(event) => {
                setScope(event.target.value);
                setSelected(null);
              }}
            >
              <option value="all">全部对象（{graph.nodes.length}）</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.label}
                  {group.nodes.length > 1
                    ? `及相关对象（${group.nodes.length}）`
                    : ''}
                </option>
              ))}
            </select>
            <span>
              {visibleNodes.length} 个对象 · {visibleEdges.length} 条关系
            </span>
          </div>
          <div className="graph" aria-label="新闻关系图">
            <ReactFlow
              key={`${currentScope}:${visibleNodes.map((node) => node.id).join(',')}`}
              nodes={nodes}
              edges={edges}
              fitView
              fitViewOptions={{
                padding: 0.15,
                minZoom: currentScope === 'all' ? 0.15 : 0.85,
                maxZoom: 1,
              }}
              minZoom={0.15}
              maxZoom={2}
              nodesDraggable={false}
              onNodeClick={(_, node) =>
                setSelected({ type: 'node', id: node.id })
              }
              onEdgeClick={(_, edge) =>
                setSelected({ type: 'edge', id: edge.id })
              }
              onPaneClick={() => setSelected(null)}
            >
              <Background gap={24} color="#e4eaf2" />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          <p className="context-note">
            {currentScope === 'all'
              ? '全图用于查看分布，选择一组对象可清楚阅读标签。'
              : '选择对象或连线查看关系与来源，可拖动画布或缩放。'}
            关系列表包含全部内容。
          </p>
        </>
      ) : (
        <div className="relation-list">
          {graph.edges.map(relation)}
          {graph.nodes
            .filter(
              (node) =>
                !graph.edges.some(
                  (edge) => edge.source === node.id || edge.target === node.id,
                ),
            )
            .map((node) => (
              <article key={node.id}>
                <strong>{node.label}</strong>
                <p className="content-meta">材料中出现的对象</p>
                <div className="inline-links">
                  {node.sourceIds.map((id, index) => (
                    <Link to={`/news/${id}`} key={id}>
                      依据报道 {index + 1}
                    </Link>
                  ))}
                </div>
              </article>
            ))}
        </div>
      )}
      {item && (
        <section className="graph-detail">
          <h3>{item.label}</h3>
          <div className="inline-links">
            {item.sourceIds.map((id, index) => (
              <Link key={id} to={`/news/${id}`}>
                查看依据报道 {index + 1}
              </Link>
            ))}
          </div>
          {view === 'graph' && (
            <div className="relation-list">
              {graph.edges.filter((edge) => related.has(edge.id)).map(relation)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
