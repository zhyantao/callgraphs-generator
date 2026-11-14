// 函数列表：可搜索、与调用图联动（点击切换到该函数的局部上下文）

let funcListState = {
  gridEl: null,
  nodes: [],
  selected: null,
  onSelect: null,
  counts: null,
  query: '',
};

function renderFunctionList(gridEl, nodes, opts = {}) {
  funcListState = {
    gridEl,
    nodes,
    selected: opts.selected || null,
    onSelect: opts.onSelect || null,
    counts: opts.counts || null,
    query: funcListState.query || '',
  };
  drawFunctionList();
}

function setFunctionListSelected(id) {
  funcListState.selected = id;
  drawFunctionList();
}

function setFunctionListQuery(query) {
  funcListState.query = query;
  drawFunctionList();
}

function drawFunctionList() {
  const { gridEl, nodes, selected, onSelect, counts, query } = funcListState;
  if (!gridEl) return;
  gridEl.innerHTML = '';

  const q = query.trim().toLowerCase();
  const shown = nodes.filter(
    (n) => !q || n.name.toLowerCase().includes(q) || (n.file || '').toLowerCase().includes(q)
  );

  // 计数（过滤时显示 N / M）
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

    // 调用度：↓ 自己调用了几个 ↑ 被几个函数调用
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

// 搜索框（脚本在 body 末尾加载，DOM 已就绪）
const funcSearchEl = document.getElementById('func-search');
if (funcSearchEl) {
  funcSearchEl.addEventListener('input', () => setFunctionListQuery(funcSearchEl.value));
}
