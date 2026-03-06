// IndexedDB 工具 - 用于浏览器端数据存储
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface NodeObject {
  id: string;
  name: string;
  file: string;
  line?: number;
}

interface EdgeObject {
  caller: string;
  callee: string;
  line?: number;
}

interface CallGraphDB extends DBSchema {
  sourceFiles: {
    key: string;
    value: {
      id: string;
      name: string;
      content: string;
      uploadedAt: number;
    };
    indexes: { 'by-date': number };
  };
  callGraphs: {
    key: string;
    value: {
      id: string;
      name: string;
      nodes: string;
      edges: string;
      createdAt: number;
    };
    indexes: { 'by-date': number };
  };
}

let db: IDBPDatabase<CallGraphDB> | null = null;

export async function initDB(): Promise<IDBPDatabase<CallGraphDB>> {
  if (db) return db;
  
  db = await openDB<CallGraphDB>('callgraphs-db', 1, {
    upgrade(database) {
      // 源代码文件存储
      const fileStore = database.createObjectStore('sourceFiles', {
        keyPath: 'id',
      });
      fileStore.createIndex('by-date', 'uploadedAt');
      
      // 调用关系图存储
      const graphStore = database.createObjectStore('callGraphs', {
        keyPath: 'id',
      });
      graphStore.createIndex('by-date', 'createdAt');
    },
  });
  
  return db;
}

// 源代码操作
export async function saveSourceFile(name: string, content: string): Promise<string> {
  const database = await initDB();
  const id = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  await database.put('sourceFiles', {
    id,
    name,
    content,
    uploadedAt: Date.now(),
  });
  return id;
}

export async function getSourceFiles(): Promise<CallGraphDB['sourceFiles']['value'][]> {
  const database = await initDB();
  return database.getAllFromIndex('sourceFiles', 'by-date');
}

export async function getSourceFile(id: string): Promise<CallGraphDB['sourceFiles']['value'] | undefined> {
  const database = await initDB();
  return database.get('sourceFiles', id);
}

export async function deleteSourceFile(id: string): Promise<void> {
  const database = await initDB();
  await database.delete('sourceFiles', id);
}

// 调用关系图操作
export async function saveCallGraph(name: string, nodes: NodeObject[], edges: EdgeObject[]): Promise<string> {
  const database = await initDB();
  const id = `graph-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  await database.put('callGraphs', {
    id,
    name,
    nodes: JSON.stringify(nodes),
    edges: JSON.stringify(edges),
    createdAt: Date.now(),
  });
  return id;
}

export async function getCallGraphs(): Promise<CallGraphDB['callGraphs']['value'][]> {
  const database = await initDB();
  return database.getAllFromIndex('callGraphs', 'by-date');
}

export async function getCallGraph(id: string): Promise<CallGraphDB['callGraphs']['value'] | undefined> {
  const database = await initDB();
  return database.get('callGraphs', id);
}

export async function deleteCallGraph(id: string): Promise<void> {
  const database = await initDB();
  await database.delete('callGraphs', id);
}
