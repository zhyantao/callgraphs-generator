// 调用关系图可视化（d3 力导向图，Tufte 配色）
// 支持两种视图：全部（默认） / 选中函数的局部上下文（直接调用 + 被调用）
// 与函数列表双向联动

const svgEl = document.getElementById('graph-svg');
const containerEl = document.getElementById('graph-container');
const shellEl = document.getElementById('graph-shell');
const emptyEl = document.getElementById('graph-empty');
const statsEl = document.getElementById('graph-stats');
const infoEl = document.getElementById('node-info');
const funcPanelEl = document.getElementById('func-panel');
const funcGridEl = document.getElementById('func-grid');
const btnShowAllEl = document.getElementById('btn-show-all');

let currentSimulation = null;

// 全量图数据与派生结构
let fullGraph = { nodes: [], edges: [] };
let selectedNodeId = null;
let nodeById = {};
let callersOf = {};   // id -> [caller ids]
let calleesOf = {};   // id -> [callee ids]

const NODE_RADIUS = 24;
const LABEL_MAX = 16; // 图上函数名最大显示字符数，超出截断（悬停节点看全名）

function shortLabel(name) {
  return name && name.length > LABEL_MAX ? name.slice(0, LABEL_MAX - 1) + '…' : name;
}

// ------------------------------------------------------------- 数据准备

function buildAdjacency(nodes, edges) {
  nodeById = {};
  callersOf = {};
  calleesOf = {};
  for (const n of nodes) {
    nodeById[n.id] = n;
    callersOf[n.id] = [];
    calleesOf[n.id] = [];
  }
  for (const e of edges) {
    if (nodeById[e.caller] && nodeById[e.callee]) {
      if (!calleesOf[e.caller].includes(e.callee)) calleesOf[e.caller].push(e.callee);
      if (!callersOf[e.callee].includes(e.caller)) callersOf[e.callee].push(e.caller);
    }
  }
}

/** 选中函数的局部上下文：它自己 + 直接调用 + 被调用 */
function getLocalSubgraph(id) {
  const keep = new Set([id]);
  for (const c of calleesOf[id] || []) keep.add(c);
  for (const c of callersOf[id] || []) keep.add(c);
  const nodes = fullGraph.nodes.filter((n) => keep.has(n.id));
  const edges = fullGraph.edges.filter((e) => keep.has(e.caller) && keep.has(e.callee));
  return { nodes, edges };
}

// ------------------------------------------------------------- 视图切换

/** 载入一份新的完整调用图（清空选中状态） */
function loadCallGraph(nodes, edges) {
  fullGraph = { nodes, edges };
  selectedNodeId = null;
  buildAdjacency(nodes, edges);
  updateView();
}

function selectFunction(id) {
  if (!nodeById[id]) return;
  selectedNodeId = id;
  updateView();
}

function showAllFunctions() {
  selectedNodeId = null;
  updateView();
}

function updateView() {
  if (fullGraph.nodes.length === 0) return;

  let nodes, edges;
  if (selectedNodeId) {
    ({ nodes, edges } = getLocalSubgraph(selectedNodeId));
  } else {
    nodes = fullGraph.nodes;
    edges = fullGraph.edges;
  }

  emptyEl.hidden = true;
  shellEl.hidden = false;
  funcPanelEl.hidden = false;
  btnShowAllEl.hidden = !selectedNodeId;
  statsEl.textContent = selectedNodeId
    ? `局部视图: ${nodes.length} 节点 / ${edges.length} 边 ｜ 全图: ${fullGraph.nodes.length} 节点`
    : `节点: ${nodes.length} | 边: ${edges.length}`;

  renderCallGraph(nodes, edges);
  renderFunctionList(funcGridEl, fullGraph.nodes, {
    selected: selectedNodeId,
    onSelect: selectFunction,
    counts: (id) => ({ callers: (callersOf[id] || []).length, callees: (calleesOf[id] || []).length }),
  });
  renderNodeInfo();
}

// ------------------------------------------------------------- 节点信息面板

function makeChipRow(label, ids) {
  const sec = document.createElement('div');
  sec.className = 'info-sec';
  const t = document.createElement('div');
  t.className = 'info-label sans';
  t.textContent = `${label} (${ids.length})`;
  const row = document.createElement('div');
  row.className = 'chip-row';
  if (ids.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'sans chip-empty';
    empty.textContent = '无';
    row.appendChild(empty);
  }
  for (const id of ids) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip sans';
    chip.textContent = nodeById[id].name;
    chip.title = nodeById[id].file || '';
    chip.addEventListener('click', () => selectFunction(id));
    row.appendChild(chip);
  }
  sec.appendChild(t);
  sec.appendChild(row);
  return sec;
}

function renderNodeInfo() {
  if (!selectedNodeId || !nodeById[selectedNodeId]) {
    infoEl.hidden = true;
    infoEl.innerHTML = '';
    return;
  }
  const node = nodeById[selectedNodeId];
  infoEl.hidden = false;
  infoEl.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'info-head';
  const strong = document.createElement('strong');
  strong.textContent = node.name;
  head.appendChild(strong);
  const fileSpan = document.createElement('span');
  fileSpan.className = 'sans info-file';
  fileSpan.textContent = `　${node.file || ''}`;
  head.appendChild(fileSpan);
  infoEl.appendChild(head);

  infoEl.appendChild(makeChipRow('调用 ↓', calleesOf[selectedNodeId] || []));
  infoEl.appendChild(makeChipRow('被调用 ↑', callersOf[selectedNodeId] || []));
}

// ------------------------------------------------------------- d3 渲染

/** 渲染给定节点/边的力导向图（内部函数） */
function renderCallGraph(nodes, edges) {
  if (currentSimulation) currentSimulation.stop();

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

  // 点击空白处取消选中，回到全图
  g.append('rect')
    .attr('x', -width * 2)
    .attr('y', -height * 2)
    .attr('width', width * 5)
    .attr('height', height * 5)
    .attr('fill', 'transparent')
    .on('click', () => showAllFunctions());

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

  // 节点圆形（Tufte 暗红；选中节点加深并加粗描边）
  node.append('circle')
    .attr('r', (d) => (d.id === selectedNodeId ? 24 : 20))
    .attr('fill', (d) => (d.id === selectedNodeId ? '#5c0000' : '#a00000'))
    .attr('stroke', (d) => (d.id === selectedNodeId ? '#ffb000' : '#fffff8'))
    .attr('stroke-width', (d) => (d.id === selectedNodeId ? 3 : 2));

  // 节点标签（长函数名截断，避免重叠；完整名字通过悬停 tooltip 查看）
  node.append('title')
    .text((d) => `${d.name}（${d.file || ''}）`);
  node.append('text')
    .text((d) => shortLabel(d.name))
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

  // 点击事件：切换到该函数的局部上下文视图
  node.on('click', (event, d) => {
    event.stopPropagation();
    selectFunction(d.id);
  });

  // 连线末端在目标节点边缘截断，避免箭头被节点圆形遮住
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

// 工具栏「显示全部」按钮
btnShowAllEl.addEventListener('click', showAllFunctions);
