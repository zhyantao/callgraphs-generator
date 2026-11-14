// 页面主逻辑：上传 → 解析 → 可视化 → 保存/导出/导入

// ------------------------------------------------------------- DOM 引用
const $ = (id) => document.getElementById(id);

const dropzone = $('dropzone');
const dropzoneHint = $('dropzone-hint');
const fileInput = $('file-input');
const fileListWrap = $('file-list-wrap');
const fileList = $('file-list');
const fileCount = $('file-count');
const uploadMsg = $('upload-msg');
const btnClearFiles = $('btn-clear-files');
const btnSaveFiles = $('btn-save-files');
const btnLoadFiles = $('btn-load-files');

const btnAnalyze = $('btn-analyze');
const messageEl = $('message');
const graphTools = $('graph-tools');
const graphInput = $('graph-input');

const logShell = $('log-shell');
const buildLog = $('build-log');
const btnCloseLog = $('btn-close-log');

// ------------------------------------------------------------- 状态
let files = [];           // [{name, content}]
let callGraph = { nodes: [], edges: [] };
let analyzing = false;

// ------------------------------------------------------------- 通用 UI
function showMessage(text) {
  if (!text) {
    messageEl.hidden = true;
    return;
  }
  messageEl.textContent = text;
  messageEl.hidden = false;
}

function appendLog(text) {
  buildLog.textContent += text;
  logShell.hidden = false;
}

function refreshUploadButtons() {
  btnSaveFiles.disabled = files.length === 0;
  btnAnalyze.disabled = files.length === 0 || analyzing;
}

// ------------------------------------------------------------- 文件上传
function renderFileList() {
  fileList.innerHTML = '';
  fileCount.textContent = String(files.length);
  fileListWrap.hidden = files.length === 0;
  refreshUploadButtons();

  files.forEach((file, index) => {
    const li = document.createElement('li');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = file.name;
    const sizeSpan = document.createElement('span');
    sizeSpan.className = 'file-size sans';
    sizeSpan.textContent = `${(file.content.length / 1024).toFixed(1)} KB`;
    nameSpan.appendChild(sizeSpan);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'list-btn';
    btn.textContent = '移除';
    btn.addEventListener('click', () => {
      files.splice(index, 1);
      renderFileList();
    });

    li.appendChild(nameSpan);
    li.appendChild(btn);
    fileList.appendChild(li);
  });
}

async function readFiles(fileListInput) {
  uploadMsg.hidden = true;
  const incoming = [];
  for (const file of Array.from(fileListInput)) {
    try {
      const content = await file.text();
      incoming.push({ name: file.name, content });
    } catch (err) {
      console.error('读取文件失败:', file.name, err);
      uploadMsg.textContent = `读取文件失败: ${file.name}`;
      uploadMsg.hidden = false;
    }
  }
  if (incoming.length > 0) {
    files = incoming;
    renderFileList();
    uploadMsg.textContent = `已加载 ${incoming.length} 个反汇编文件`;
    uploadMsg.hidden = false;
  }
}

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
  dropzoneHint.textContent = '松开即导入文件';
});
dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
  dropzoneHint.textContent = '拖拽 objdump 文本到此处，或点击选择';
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  dropzoneHint.textContent = '拖拽 objdump 文本到此处，或点击选择';
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    readFiles(e.dataTransfer.files);
  }
});
fileInput.addEventListener('change', () => {
  if (fileInput.files) readFiles(fileInput.files);
  fileInput.value = '';
});

btnClearFiles.addEventListener('click', () => {
  uploadMsg.hidden = true;
  files = [];
  renderFileList();
});

btnSaveFiles.addEventListener('click', async () => {
  btnSaveFiles.disabled = true;
  try {
    for (const file of files) {
      await saveSourceFile(file.name, file.content);
    }
    uploadMsg.textContent = '文件已保存到浏览器本地数据库';
    uploadMsg.hidden = false;
  } catch (error) {
    uploadMsg.textContent = '保存失败';
    uploadMsg.hidden = false;
    console.error(error);
  }
  refreshUploadButtons();
});

btnLoadFiles.addEventListener('click', async () => {
  btnSaveFiles.disabled = true;
  try {
    const saved = await getSourceFiles();
    files = saved.map((f) => ({ name: f.name, content: f.content }));
    renderFileList();
    uploadMsg.textContent = `已加载 ${files.length} 个保存的文件`;
    uploadMsg.hidden = false;
  } catch (error) {
    uploadMsg.textContent = `加载失败: ${error}`;
    uploadMsg.hidden = false;
    console.error(error);
  }
  refreshUploadButtons();
});

// ------------------------------------------------------------- 确认弹窗
// 用页面内弹窗代替原生 confirm：原生对话框可能被浏览器
// （"禁止此页面显示更多对话框"）静默抑制，导致永远返回 false
function confirmDialog(text) {
  const modal = $('confirm-modal');
  const ok = $('confirm-ok');
  const cancel = $('confirm-cancel');
  $('confirm-text').textContent = text;
  modal.hidden = false;
  return new Promise((resolve) => {
    const done = (value) => {
      modal.hidden = true;
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    const onBackdrop = (e) => { if (e.target === modal) done(false); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
    ok.focus();
  });
}

$('btn-clear-db').addEventListener('click', async () => {
  const confirmed = await confirmDialog(
    '确定清除浏览器中保存的全部数据吗？\n包括已保存的反汇编文件和调用关系图，此操作不可恢复。'
  );
  if (!confirmed) return;
  try {
    await clearAllData();
    files = [];
    renderFileList();
    uploadMsg.textContent = '已清除浏览器本地保存的所有数据';
    uploadMsg.hidden = false;
  } catch (error) {
    uploadMsg.textContent = `清除失败: ${error}`;
    uploadMsg.hidden = false;
    console.error(error);
  }
});

// ------------------------------------------------------------- 解析
btnAnalyze.addEventListener('click', async () => {
  if (files.length === 0) {
    showMessage('请先上传 objdump -d 的输出文本');
    return;
  }

  analyzing = true;
  btnAnalyze.disabled = true;
  btnAnalyze.textContent = '解析中…';
  buildLog.textContent = '[前端文本解析] 提取函数头与 call/bl 指令\n\n';
  logShell.hidden = false;

  try {
    const results = files.map((f) => {
      const r = parseObjdumpText(f.name, f.content);
      appendLog(`✓ ${f.name}: ${r.definedFunctions.length} 个函数, ${r.rawEdges.length} 条调用\n`);
      if (r.definedFunctions.length === 0) {
        appendLog('  ⚠ 未识别到函数头 —— 请确认是 objdump -d 的完整输出，且产物未 strip 符号表\n');
      }
      return r;
    });

    const graph = assembleGraph(results);
    appendLog(
      `\n合计: ${graph.nodes.length} 个函数节点, ${graph.edges.length} 条调用边\n` +
      '外部符号（printf 等）标记为 “(外部符号)”\n'
    );

    if (graph.nodes.length > 0) {
      callGraph = graph;
      renderCallGraph(callGraph.nodes, callGraph.edges);
      graphTools.hidden = false;
      showMessage(`解析完成: ${graph.nodes.length} 个函数, ${graph.edges.length} 条调用关系`);
    } else {
      showMessage('未能提取到调用关系，请检查文件内容（见解析日志）');
    }
  } catch (error) {
    appendLog(`\n✗ 解析失败: ${error}\n`);
    showMessage('解析失败');
    console.error(error);
  } finally {
    analyzing = false;
    refreshUploadButtons();
    btnAnalyze.textContent = '解析调用关系';
  }
});

btnCloseLog.addEventListener('click', () => {
  logShell.hidden = true;
});

// ------------------------------------------------------------- 保存 / 加载调用图
$('btn-save-graph').addEventListener('click', async () => {
  if (callGraph.nodes.length === 0) {
    showMessage('没有可保存的调用图');
    return;
  }
  try {
    const edgesForSave = callGraph.edges.map((e) => ({ caller: e.caller, callee: e.callee }));
    await saveCallGraph(`调用图 ${new Date().toLocaleString()}`, callGraph.nodes, edgesForSave);
    showMessage('调用图已保存到浏览器本地数据库');
  } catch (error) {
    showMessage('保存失败');
    console.error(error);
  }
});

$('btn-load-graph').addEventListener('click', async () => {
  try {
    const graphs = await getCallGraphs();
    if (graphs.length === 0) {
      showMessage('没有保存的调用图');
      return;
    }
    const latest = graphs[graphs.length - 1];
    const nodes = JSON.parse(latest.nodes);
    const edges = JSON.parse(latest.edges);
    callGraph = { nodes, edges };
    renderCallGraph(nodes, edges);
    graphTools.hidden = false;
    showMessage('已加载最近保存的调用图');
  } catch (error) {
    showMessage(`加载失败: ${error}`);
    console.error(error);
  }
});

// ------------------------------------------------------------- 导出 / 导入
$('btn-export-graph').addEventListener('click', async () => {
  if (callGraph.nodes.length === 0) {
    showMessage('没有可导出的调用图');
    return;
  }
  try {
    const zip = new JSZip();
    const nodesData = callGraph.nodes.map((n) => ({ id: n.id, name: n.name, file: n.file }));
    const edgesData = callGraph.edges.map((e) => ({ source: e.caller, target: e.callee }));

    zip.file('callgraph_nodes.json', JSON.stringify(nodesData, null, 2));
    zip.file('callgraph_edges.json', JSON.stringify(edgesData, null, 2));
    zip.file('callgraph_full.json', JSON.stringify({
      nodes: nodesData,
      edges: edgesData,
      exportedAt: new Date().toISOString(),
    }, null, 2));

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `callgraph_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showMessage('调用图已导出到本地');
  } catch (error) {
    showMessage('导出失败');
    console.error(error);
  }
});

graphInput.addEventListener('change', async () => {
  const file = graphInput.files && graphInput.files[0];
  if (!file) return;

  try {
    const arrayBuffer = await file.arrayBuffer();

    let nodes = [];
    let edges = [];

    if (file.name.toLowerCase().endsWith('.json')) {
      // 单 JSON 文件导入
      const data = JSON.parse(await file.text());
      nodes = data.nodes || [];
      edges = (data.edges || []).map((e) => ({
        caller: e.caller || e.source,
        callee: e.callee || e.target,
      }));
    } else {
      const zip = await JSZip.loadAsync(arrayBuffer);
      const fullJson = await zip.file('callgraph_full.json')?.async('text');
      if (fullJson) {
        const data = JSON.parse(fullJson);
        nodes = data.nodes || [];
        edges = (data.edges || []).map((e) => ({
          caller: e.caller || e.source,
          callee: e.callee || e.target,
        }));
      } else {
        const nodesJson = await zip.file('callgraph_nodes.json')?.async('text');
        const edgesJson = await zip.file('callgraph_edges.json')?.async('text');
        if (nodesJson && edgesJson) {
          nodes = JSON.parse(nodesJson);
          edges = JSON.parse(edgesJson).map((e) => ({
            caller: e.caller || e.source,
            callee: e.callee || e.target,
          }));
        }
      }
    }

    if (nodes.length > 0) {
      callGraph = { nodes, edges };
      renderCallGraph(nodes, edges);
      graphTools.hidden = false;
      showMessage(`已导入调用图: ${nodes.length} 个函数, ${edges.length} 个调用关系`);
    } else {
      showMessage('无效的调用图文件');
    }
  } catch (error) {
    showMessage('导入失败');
    console.error(error);
  }

  graphInput.value = '';
});

// 页面脚本就绪标记（供无 UI 自动化检测脚本是否正常执行）
document.documentElement.dataset.appReady = '1';
