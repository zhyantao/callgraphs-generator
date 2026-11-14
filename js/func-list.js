// 函数列表面板：两种视图模式
//   list — 扁平列表，可搜索，与调用图联动
//   tree — 以选中函数为中心的调用层级树（向下调用 / 向上被调用）

let funcListState = {
  gridEl: null,
  nodes: [],
  selected: null,
  onSelect: null,
  counts: null,
  query: '',
};

let funcViewMode = 'list'; // 'list' | 'tree'
const TREE_MAX_DEPTH = 6;  // 层级树最大展开深度（防循环/爆炸）

function renderFunctionList(gridEl, nodes, opts = {}) {
  funcListState = {
    gridEl,
    nodes,
    selected: opts.selected || null,
    onSelect: opts.onSelect || null,
    counts: opts.counts || null,
    query: funcListState.query || '',
  };
  // 没有选中函数时层级树没有根，自动退回列表模式
  if (funcViewMode === 'tree' && !funcListState.selected) funcViewMode = 'list';
  syncFuncTabs();
  drawFunctionPanel();
}

function setFunctionListSelected(id) {
  funcListState.selected = id;
  drawFunctionPanel();
}

function setFunctionListQuery(query) {
  funcListState.query = query;
  drawFunctionPanel();
}

function setFunctionViewMode(mode) {
  funcViewMode = mode;
  syncFuncTabs();
  drawFunctionPanel();
}

function syncFuncTabs() {
  const listTab = document.getElementById('func-tab-list');
  const treeTab = document.getElementById('func-tab-tree');
  const search = document.getElementById('func-search');
  if (listTab) listTab.classList.toggle('active', funcViewMode === 'list');
  if (treeTab) treeTab.classList.toggle('active', funcViewMode === 'tree');
  // 列表模式禁用切换？层级模式必须有选中函数；tree 无选中时回退 list
  if (treeTab) treeTab.disabled = !funcListState.selected;
  if (search) search.hidden = funcViewMode !== 'list';
}

function drawFunctionPanel() {
  if (funcViewMode === 'tree' && funcListState.selected) {
    drawFunctionHierarchy();
  } else {
    drawFlatList();
  }
}

// ------------------------------------------------------------- 扁平列表

function drawFlatList() {
  const { gridEl, nodes, selected, onSelect, counts, query } = funcListState;
  if (!gridEl) return;
  gridEl.innerHTML = '';

  const q = (query || '').trim().toLowerCase();
  const shown = nodes.filter(
    (n) => !q || n.name.toLowerCase().includes(q) || (n.file || '').toLowerCase().includes(q)
  );

  const countEl = document.getElementById('func-count');
  if (countEl) {
    countEl.textContent = q
      ? `${shown.length} / ${nodes.length} 个函数`
      : `${nodes.length} 个函数`;
  }

  for (const node of shown) {
    const item = document.createElement('div');
    item.className = 'func-item' + (node.id === selected ? ' selected' : '');
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.title = '点击查看该函数的局部调用关系';

    const head = document.createElement('div');
    head.className = 'func-item-head';

    const name = document.createElement('span');
    name.className = 'func-name';
    name.textContent = node.name;
    head.appendChild(name);

    if (counts) {
      const c = counts(node.id);
      const deg = document.createElement('span');
      deg.className = 'func-degrees sans';
      deg.textContent = `↓${c.callees} ↑${c.callers}`;
      head.appendChild(deg);
    }

    const file = document.createElement('span');
    file.className = 'func-file sans';
    file.textContent = node.file;

    item.appendChild(head);
    item.appendChild(file);

    const activate = () => { if (onSelect) onSelect(node.id); };
    item.addEventListener('click', activate);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });

    gridEl.appendChild(item);
  }

  if (shown.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'sans func-empty';
    empty.textContent = '没有匹配的函数';
    gridEl.appendChild(empty);
  }
}

// ------------------------------------------------------------- 调用层级树

function makeTreeNode(id, depth, path, direction) {
  const node = nodeById[id];
  if (!node) return null;
  // direction: 'down' = 它调用了谁, 'up' = 谁调用了它
  const allKids = (direction === 'down' ? calleesOf[id] : callersOf[id]) || [];
  // 环路保护：祖先链上出现过的节点不再展开
  const kids = depth < TREE_MAX_DEPTH ? allKids.filter((k) => !path.has(k)) : [];

  const wrap = document.createElement('div');
  wrap.className = 'tree-node';

  const row = document.createElement('div');
  row.className = 'tree-row' + (id === funcListState.selected ? ' selected' : '');
  row.style.paddingLeft = `${depth * 1.4}rem`;

  // 展开箭头（根节点默认展开，箭头状态与实际一致）
  const initialExpanded = depth === 0;
  const expander = document.createElement('button');
  expander.type = 'button';
  expander.className = 'tree-expander sans';
  if (kids.length > 0) {
    expander.textContent = initialExpanded ? '▾' : '▸';
    expander.title = '展开 / 收起';
  } else {
    expander.textContent = '·';
    expander.disabled = true;
  }
  row.appendChild(expander);

  // 函数名（点击重新选中）
  const nameBtn = document.createElement('button');
  nameBtn.type = 'button';
  nameBtn.className = 'tree-name';
  nameBtn.textContent = node.name;
  nameBtn.title = `${node.name}（${node.file || ''}）— 点击以此函数为中心`;
  if (id === funcListState.selected) nameBtn.classList.add('center');
  nameBtn.addEventListener('click', () => {
    if (funcListState.onSelect && id !== funcListState.selected) funcListState.onSelect(id);
  });
  row.appendChild(nameBtn);

  // 调用度
  if (funcListState.counts) {
    const c = funcListState.counts(id);
    const deg = document.createElement('span');
    deg.className = 'func-degrees sans';
    deg.textContent = direction === 'down' ? `↓${c.callees}` : `↑${c.callers}`;
    row.appendChild(deg);
  }

  wrap.appendChild(row);

  // 子节点容器
  if (kids.length > 0) {
    const kidsWrap = document.createElement('div');
    kidsWrap.className = 'tree-kids';
    kidsWrap.hidden = !initialExpanded; // 根的直接子级默认展开
    let expanded = initialExpanded;

    const toggle = () => {
      expanded = !expanded;
      kidsWrap.hidden = !expanded;
      expander.textContent = expanded ? '▾' : '▸';
    };
    expander.addEventListener('click', toggle);

    for (const kid of kids) {
      const childPath = new Set(path);
      childPath.add(id);
      const child = makeTreeNode(kid, depth + 1, childPath, direction);
      if (child) kidsWrap.appendChild(child);
    }
    wrap.appendChild(kidsWrap);
  }

  return wrap;
}

function drawFunctionHierarchy() {
  const { gridEl, selected, onSelect } = funcListState;
  if (!gridEl || !selected) return;
  gridEl.innerHTML = '';
  gridEl.classList.add('tree-mode');

  const center = nodeById[selected];
  const countEl = document.getElementById('func-count');
  if (countEl) countEl.textContent = `以 ${center.name} 为中心`;

  const goCenter = (id) => { if (onSelect) onSelect(id); };

  // 被调用（向上）
  const upSec = document.createElement('div');
  upSec.className = 'tree-section';
  const upTitle = document.createElement('div');
  upTitle.className = 'tree-section-title sans';
  upTitle.textContent = '↑ 被调用（谁调用了它）';
  upSec.appendChild(upTitle);
  upSec.appendChild(makeTreeNode(selected, 0, new Set(), 'up'));
  gridEl.appendChild(upSec);

  // 调用（向下）
  const downSec = document.createElement('div');
  downSec.className = 'tree-section';
  const downTitle = document.createElement('div');
  downTitle.className = 'tree-section-title sans';
  downTitle.textContent = '↓ 调用（它调用了谁）';
  downSec.appendChild(downTitle);
  downSec.appendChild(makeTreeNode(selected, 0, new Set(), 'down'));
  gridEl.appendChild(downSec);
}

// ------------------------------------------------------------- 事件绑定

const funcSearchEl = document.getElementById('func-search');
if (funcSearchEl) {
  funcSearchEl.addEventListener('input', () => setFunctionListQuery(funcSearchEl.value));
}
const funcTabList = document.getElementById('func-tab-list');
if (funcTabList) {
  funcTabList.addEventListener('click', () => setFunctionViewMode('list'));
}
const funcTabTree = document.getElementById('func-tab-tree');
if (funcTabTree) {
  funcTabTree.addEventListener('click', () => setFunctionViewMode('tree'));
}
