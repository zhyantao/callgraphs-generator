// 函数列表渲染
function renderFunctionList(gridEl, nodes) {
  gridEl.innerHTML = '';
  for (const node of nodes) {
    const item = document.createElement('div');
    item.className = 'func-item';

    const name = document.createElement('span');
    name.className = 'func-name';
    name.textContent = node.name;

    const file = document.createElement('span');
    file.className = 'func-file sans';
    file.textContent = node.file;

    item.appendChild(name);
    item.appendChild(file);
    gridEl.appendChild(item);
  }
}
