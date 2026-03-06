'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  file: string;
  line?: number;
}

interface Edge {
  source: Node | string;
  target: Node | string;
  line?: number;
}

interface CallGraphViewerProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick?: (node: Node) => void;
}

export default function CallGraphViewer({ nodes, edges, onNodeClick }: CallGraphViewerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || nodes.length === 0) return;

    // 清空之前的内容
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = containerRef.current.clientWidth;
    const height = 600;

    svg.attr('width', width).attr('height', height);

    // 创建箭头标记
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .append('path')
      .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
      .attr('fill', '#666');

    // 创建容器
    const g = svg.append('g');

    // 添加缩放功能
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // 创建力导向图
    const simulation = d3.forceSimulation<Node>(nodes as Node[])
      .force('link', d3.forceLink<Node, Edge>(edges)
        .id(d => d.id)
        .distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40));

    // 绘制边
    const link = g.append('g')
      .selectAll('line')
      .data(edges)
      .enter()
      .append('line')
      .attr('stroke', '#999')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrowhead)');

    // 绘制节点
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .call(d3.drag<SVGGElement, Node>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }));

    // 节点圆形
    node.append('circle')
      .attr('r', 20)
      .attr('fill', '#4a90d9')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // 节点标签
    node.append('text')
      .text(d => d.name)
      .attr('x', 0)
      .attr('y', 35)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', '#333');

    // 文件名标签
    node.append('text')
      .text(d => d.file)
      .attr('x', 0)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('fill', '#888');

    // 点击事件
    node.on('click', (event, d) => {
      setSelectedNode(d);
      if (onNodeClick) {
        onNodeClick(d);
      }
    });

    // 更新位置
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as Node).x || 0)
        .attr('y1', d => (d.source as Node).y || 0)
        .attr('x2', d => (d.target as Node).x || 0)
        .attr('y2', d => (d.target as Node).y || 0);

      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, onNodeClick]);

  if (nodes.length === 0) {
    return (
      <div className="p-8 border-2 border-dashed rounded-lg text-center text-gray-500">
        <p>暂无调用关系图</p>
        <p className="text-sm mt-2">请先上传代码文件并进行分析</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="p-2 bg-gray-100 border-b flex justify-between items-center">
        <span className="text-sm font-medium">🔗 调用关系图 (拖拽移动，滚轮缩放)</span>
        <span className="text-xs text-gray-500">
          节点: {nodes.length} | 边: {edges.length}
        </span>
      </div>
      <div ref={containerRef} className="overflow-hidden">
        <svg ref={svgRef}></svg>
      </div>
      
      {/* 选中节点信息 */}
      {selectedNode && (
        <div className="p-3 bg-blue-50 border-t">
          <p className="text-sm">
            <strong>选中函数:</strong> {selectedNode.name}<br />
            <strong>文件:</strong> {selectedNode.file}
            {selectedNode.line && <><br /><strong>行号:</strong> {selectedNode.line}</>}
          </p>
        </div>
      )}
    </div>
  );
}
