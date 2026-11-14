// IndexedDB 工具 - 浏览器端数据存储（原生 API，无第三方依赖）
// 数据库名/表结构与旧版一致，历史保存的数据可继续使用

const DB_NAME = 'callgraphs-db';
const DB_VERSION = 1;

let dbPromise = null;

function initDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      // 源代码文件存储
      const fileStore = database.createObjectStore('sourceFiles', { keyPath: 'id' });
      fileStore.createIndex('by-date', 'uploadedAt');
      // 调用关系图存储
      const graphStore = database.createObjectStore('callGraphs', { keyPath: 'id' });
      graphStore.createIndex('by-date', 'createdAt');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// ---------------- 源文件（反汇编文本） ----------------

async function saveSourceFile(name, content) {
  const database = await initDB();
  // 重名文件只保存一份：按文件名找到旧记录，复用其 id 覆盖内容
  const sameName = await new Promise((resolve, reject) => {
    const tx = database.transaction('sourceFiles', 'readonly');
    const req = tx.objectStore('sourceFiles').getAll();
    req.onsuccess = () => resolve(req.result.filter((f) => f.name === name));
    req.onerror = () => reject(req.error);
  });
  const keep = sameName[0];
  // 清理历史遗留的重复记录，只保留第一条
  if (sameName.length > 1) {
    await Promise.all(sameName.slice(1).map((f) => deleteSourceFile(f.id)));
  }
  const id = keep ? keep.id : makeId('file');
  return new Promise((resolve, reject) => {
    const tx = database.transaction('sourceFiles', 'readwrite');
    tx.objectStore('sourceFiles').put({ id, name, content, uploadedAt: Date.now() });
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

async function getSourceFiles() {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('sourceFiles', 'readonly');
    const req = tx.objectStore('sourceFiles').index('by-date').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteSourceFile(id) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('sourceFiles', 'readwrite');
    tx.objectStore('sourceFiles').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------- 调用关系图 ----------------

async function saveCallGraph(name, nodes, edges) {
  const database = await initDB();
  const id = makeId('graph');
  return new Promise((resolve, reject) => {
    const tx = database.transaction('callGraphs', 'readwrite');
    tx.objectStore('callGraphs').put({
      id,
      name,
      nodes: JSON.stringify(nodes),
      edges: JSON.stringify(edges),
      createdAt: Date.now(),
    });
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

async function getCallGraphs() {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('callGraphs', 'readonly');
    const req = tx.objectStore('callGraphs').index('by-date').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteCallGraph(id) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('callGraphs', 'readwrite');
    tx.objectStore('callGraphs').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------- 清空全部本地数据 ----------------

async function clearAllData() {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(['sourceFiles', 'callGraphs'], 'readwrite');
    tx.objectStore('sourceFiles').clear();
    tx.objectStore('callGraphs').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
