// 调用关系图可视化（d3 力导向图，Tufte 配色）

const svgEl = document.getElementById('graph-svg');
const containerEl = document.getElementById('graph-container');
const shellEl = document.getElementById('graph-shell');
const emptyEl = document.getElementById('graph-empty');
const statsEl = document.getElementById('graph-stats');
const infoEl = document.getElementById('node-info');
const funcPanelEl = document.getElementById('func-panel');
const funcGridEl = document.getElementById('func-grid');

let currentSimulation = null;
let currentNodes = [];
let currentEdges = [];

/** 渲染调用图。nodes: [{id, name, file}]；edges: [{caller, callee}] */
function renderCallGraph(nodes, edges) {
  if (currentSimulation) currentSimulation.stop();

  currentNodes = nodes;
  currentEdges = edges;

  if (nodes.length === 0) {
    shellEl.hidden = true;
    emptyEl.hidden = false;
    funcPanelEl.hidden = true;
    return;
  }

  emptyEl.hidden = true;
  shellEl.hidden = false;
  funcPanelEl.hidden = false;
  statsEl.textContent = `节点: ${nodes.length} | 边: ${edges.length}`;
  infoEl.hidden = true;

  renderFunctionList(funcGridEl, nodes);

  // 清空之前的内容
  d3.select(svgEl).selectAll('*').remove();

  const width = containerEl.clientWidth || 800;
  const height = 600;

  const svg = d3.select(svgEl).attr('width', width).attr('height', height);

  // 箭头标记（refX 与路径终点对齐，箭头尖端指向目标节点）
  svg.append('defs').append('marker')
    .attr('id', 'arrowhead')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 10)
    .attr('refY', 0)
    .attr('orient', 'auto')
    .attr('markerWidth', 7)
    .attr('markerHeight', 7)
    .append('path')
    .attr('d', 'M 0,-4 L 10,0 L 0,4')
    .attr('fill', '#666');

  const g = svg.append('g');

  // 缩放
  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
  svg.call(zoom);

  // d3 forceLink 会把 caller/callee 字符串改写为节点对象
  const linkData = edges.map((e) => ({ source: e.caller, calleeId: e.callee, target: e.callee }));

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(linkData).id((d) => d.id).distance(130))
    .force('charge', d3.forceManyBody().strength(-420))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(58))
    .alphaDecay(0.05);
  currentSimulation = simulation;

  // 边
  const link = g.append('g')
    .selectAll('line')
    .data(linkData)
    .enter()
    .append('line')
    .attr('stroke', '#999')
    .attr('stroke-width', 1.5)
    .attr('marker-end', 'url(#arrowhead)');

  // 节点
  const node = g.append('g')
    .selectAll('g')
    .data(nodes)
    .enter()
    .append('g')
    .attr('cursor', 'pointer')
    .call(d3.drag()
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

  // 节点圆形（Tufte 暗红）
  node.append('circle')
    .attr('r', 20)
    .attr('fill', '#a00000')
    .attr('stroke', '#fffff8')
    .attr('stroke-width', 2);

  // 节点标签
  node.append('text')
    .text((d) => d.name)
    .attr('x', 0)
    .attr('y', 35)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .attr('font-family', 'Gill Sans, Lato, Calibri, sans-serif')
    .attr('fill', '#111');

  // 文件名标签
  node.append('text')
    .text((d) => d.file)
    .attr('x', 0)
    .attr('y', 48)
    .attr('text-anchor', 'middle')
    .attr('font-size', '9px')
    .attr('font-family', 'Gill Sans, Lato, Calibri, sans-serif')
    .attr('fill', '#555');

  // 点击事件：显示节点信息
  node.on('click', (event, d) => {
    infoEl.hidden = false;
    infoEl.innerHTML = '';
    const strong1 = document.createElement('strong');
    strong1.textContent = '选中函数: ';
    infoEl.appendChild(strong1);
    infoEl.appendChild(document.createTextNode(d.name));
    infoEl.appendChild(document.createElement('br'));
    const strong2 = document.createElement('strong');
    strong2.textContent = '文件: ';
    infoEl.appendChild(strong2);
    infoEl.appendChild(document.createTextNode(d.file));
  });

  // 连线末端在目标节点边缘截断，避免箭头被节点圆形遮住
  const NODE_RADIUS = 24;

  const updatePositions = () => {
    link
      .attr('x1', (d) => d.source.x || 0)
      .attr('y1', (d) => d.source.y || 0)
      .attr('x2', (d) => {
        const dx = (d.target.x || 0) - (d.source.x || 0);
        const dy = (d.target.y || 0) - (d.source.y || 0);
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        return (d.target.x || 0) - (dx / len) * NODE_RADIUS;
      })
      .attr('y2', (d) => {
        const dx = (d.target.x || 0) - (d.source.x || 0);
        const dy = (d.target.y || 0) - (d.source.y || 0);
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        return (d.target.y || 0) - (dy / len) * NODE_RADIUS;
      });

    node.attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`);
  };

  // 关键：离线跑完模拟让布局先稳定（页面静止不晃动）；拖拽节点时 drag 会自动重启物理
  simulation.on('tick', updatePositions);
  simulation.stop();
  for (let i = 0; i < 300; i++) simulation.tick();
  updatePositions(); // 手动 tick 不触发 tick 事件，需手动同步一次 DOM
}
