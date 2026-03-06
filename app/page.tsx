'use client';

import { useState, useCallback, useRef } from 'react';
import FileUploader from './components/FileUploader';
import CallGraphViewer from './components/CallGraphViewer';
import LLMAnalysis from './components/LLMAnalysis';
import { saveCallGraph, getCallGraphs } from './lib/db';

interface Node {
  id: string;
  name: string;
  file: string;
  line?: number;
}

interface Edge {
  source: string | Node;
  target: string | Node;
  line?: number;
}

interface CallGraphData {
  nodes: Node[];
  edges: Edge[];
}

export default function Home() {
  const [files, setFiles] = useState<{ name: string; content: string }[]>([]);
  const [callGraph, setCallGraph] = useState<CallGraphData>({ nodes: [], edges: [] });
  const [analyzing, setAnalyzing] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [buildLog, setBuildLog] = useState('');
  const [showBuildLog, setShowBuildLog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 处理文件加载
  const handleFilesLoaded = useCallback((loadedFiles: { name: string; content: string }[]) => {
    setFiles(loadedFiles);
    setMessage(`已加载 ${loadedFiles.length} 个文件`);
  }, []);

  // 执行代码分析
  const handleAnalyze = async () => {
    if (files.length === 0) {
      setMessage('请先上传代码文件');
      return;
    }

    setAnalyzing(true);
    setMessage('正在分析代码...');

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files }),
      });

      const result = await response.json() as { success: boolean; data?: { nodes: Node[]; edges: Array<{ caller: string; callee: string; line?: number }> }; error?: string };

      if (result.success && result.data) {
        const edges = result.data.edges.map((e) => ({
          source: e.caller,
          target: e.callee,
          line: e.line,
        }));

        setCallGraph({
          nodes: result.data.nodes,
          edges,
        });
        setMessage(`分析完成: 发现 ${result.data.nodes.length} 个函数, ${edges.length} 个调用关系`);
      } else {
        setMessage('分析失败: ' + (result.error || '未知错误'));
      }
    } catch (error) {
      setMessage('分析请求失败');
      console.error(error);
    } finally {
      setAnalyzing(false);
    }
  };

  // 编译代码
  const handleCompile = async () => {
    if (files.length === 0) {
      setMessage('请先上传代码文件');
      return;
    }

    setCompiling(true);
    setShowBuildLog(true);
    setBuildLog('开始编译...\n');

    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files }),
      });

      const result = await response.json() as { success: boolean; log?: string; error?: string };

      if (result.success) {
        setBuildLog(prev => prev + (result.log || '编译完成！\n'));
        setMessage('编译完成');
      } else {
        setBuildLog(prev => prev + `编译失败: ${result.error}\n`);
        setMessage('编译失败');
      }
    } catch (error) {
      setBuildLog(prev => prev + `编译请求失败: ${error}\n`);
      setMessage('编译请求失败');
      console.error(error);
    } finally {
      setCompiling(false);
      setBuildLog(prev => prev + '\n编译任务结束。\n');
    }
  };

  // 保存调用图到数据库
  const handleSaveGraph = async () => {
    if (callGraph.nodes.length === 0) {
      setMessage('没有可保存的调用图');
      return;
    }

    try {
      const edgesForSave = callGraph.edges.map(e => ({
        caller: typeof e.source === 'string' ? e.source : (e.source as Node).id,
        callee: typeof e.target === 'string' ? e.target : (e.target as Node).id,
        line: e.line,
      }));

      await saveCallGraph(
        `调用图 ${new Date().toLocaleString()}`,
        callGraph.nodes,
        edgesForSave
      );
      setMessage('调用图已保存到数据库');
    } catch (error) {
      setMessage('保存失败');
      console.error(error);
    }
  };

  // 导出调用图到本地文件
  const handleExportGraph = useCallback(async () => {
    if (callGraph.nodes.length === 0) {
      setMessage('没有可导出的调用图');
      return;
    }

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      
      const nodesData = callGraph.nodes.map(n => ({
        id: n.id,
        name: n.name,
        file: n.file,
        line: n.line,
      }));
      
      const edgesData = callGraph.edges.map(e => ({
        source: typeof e.source === 'string' ? e.source : (e.source as Node).id,
        target: typeof e.target === 'string' ? e.target : (e.target as Node).id,
        line: e.line,
      }));
      
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
      
      setMessage('调用图已导出到本地');
    } catch (error) {
      setMessage('导出失败');
      console.error(error);
    }
  }, [callGraph]);

  // 从本地上传调用图
  const handleImportGraph = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const JSZip = (await import('jszip')).default;
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      
      let nodes: Node[] = [];
      let edges: Edge[] = [];
      
      const fullJson = await zip.file('callgraph_full.json')?.async('text');
      if (fullJson) {
        const data = JSON.parse(fullJson);
        nodes = data.nodes || [];
        edges = (data.edges || []).map((e: { source: string; target: string; line?: number }) => ({
          source: e.source,
          target: e.target,
          line: e.line,
        }));
      } else {
        const nodesJson = await zip.file('callgraph_nodes.json')?.async('text');
        const edgesJson = await zip.file('callgraph_edges.json')?.async('text');
        
        if (nodesJson && edgesJson) {
          nodes = JSON.parse(nodesJson);
          edges = JSON.parse(edgesJson).map((e: { source: string; target: string; line?: number }) => ({
            source: e.source,
            target: e.target,
            line: e.line,
          }));
        }
      }
      
      if (nodes.length > 0) {
        setCallGraph({ nodes, edges });
        setMessage(`已导入调用图: ${nodes.length} 个函数, ${edges.length} 个调用关系`);
      } else {
        setMessage('无效的调用图文件');
      }
    } catch (error) {
      setMessage('导入失败');
      console.error(error);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // 加载保存的调用图
  const handleLoadGraph = async () => {
    try {
      const graphs = await getCallGraphs();
      if (graphs.length === 0) {
        setMessage('没有保存的调用图');
        return;
      }

      const latest = graphs[graphs.length - 1];
      const nodes = JSON.parse(latest.nodes) as Node[];
      const edges = JSON.parse(latest.edges).map((e: { caller: string; callee: string; line?: number }) => ({
        source: e.caller,
        target: e.callee,
        line: e.line,
      }));

      setCallGraph({ nodes, edges });
      setMessage(`已加载调用图: ${graphs.length} 个保存`);
    } catch (error) {
      setMessage('加载失败');
      console.error(error);
    }
  };

  // 处理节点点击
  const handleNodeClick = (node: Node) => {
    setSelectedFunction(node.name);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">
            🔍 C/C++ 代码调用关系分析工具
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            基于浏览器的代码分析 - 无需安装，直接使用
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧面板 */}
          <div className="lg:col-span-1 space-y-6">
            {/* 文件上传 */}
            <FileUploader onFilesLoaded={handleFilesLoaded} />

            {/* 分析控制 */}
            <div className="p-4 border rounded-lg bg-white shadow-sm">
              <h2 className="text-lg font-semibold mb-4">⚙️ 分析控制</h2>
              <div className="space-y-3">
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing || files.length === 0}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-lg disabled:opacity-50 hover:bg-green-700 font-medium"
                >
                  {analyzing ? '⏳ 分析中...' : '🚀 开始分析'}
                </button>
                
                <button
                  onClick={handleCompile}
                  disabled={compiling || files.length === 0}
                  className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg disabled:opacity-50 hover:bg-orange-700 font-medium"
                >
                  {compiling ? '🔨 编译中...' : '🔨 编译代码'}
                </button>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleSaveGraph}
                    disabled={callGraph.nodes.length === 0}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700 text-sm"
                  >
                    💾 保存图形
                  </button>
                  <button
                    onClick={handleExportGraph}
                    disabled={callGraph.nodes.length === 0}
                    className="px-3 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50 hover:bg-green-700 text-sm"
                  >
                    📥 导出图形
                  </button>
                  <button
                    onClick={handleLoadGraph}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                  >
                    📂 加载图形
                  </button>
                  <label className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm text-center cursor-pointer">
                    📤 导入图形
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".zip,.json"
                      onChange={handleImportGraph}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* 智能分析面板 */}
            {selectedFunction && (
              <LLMAnalysis
                functionName={selectedFunction}
                callGraph={{
                  nodes: callGraph.nodes,
                  edges: callGraph.edges.map(e => ({
                    caller: typeof e.source === 'string' ? e.source : (e.source as Node).id,
                    callee: typeof e.target === 'string' ? e.target : (e.target as Node).id,
                  })),
                }}
                onClose={() => setSelectedFunction(null)}
              />
            )}

            {/* 消息提示 */}
            {message && (
              <div className="p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">
                {message}
              </div>
            )}
          </div>

          {/* 右侧面板 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 编译日志面板 */}
            {showBuildLog && (
              <div className="border rounded-lg bg-white shadow-sm">
                <div className="p-2 bg-gray-100 border-b flex justify-between items-center">
                  <span className="text-sm font-medium">📝 编译日志</span>
                  <button
                    onClick={() => setShowBuildLog(false)}
                    className="text-gray-500 hover:text-gray-700 text-sm"
                  >
                    ✕ 关闭
                  </button>
                </div>
                <pre className="p-4 bg-gray-900 text-green-400 text-sm font-mono overflow-auto max-h-64 whitespace-pre-wrap">
                  {buildLog || '暂无日志'}
                </pre>
              </div>
            )}

            {/* 调用关系图 */}
            <CallGraphViewer
              nodes={callGraph.nodes}
              edges={callGraph.edges}
              onNodeClick={handleNodeClick}
            />

            {/* 函数列表 */}
            {callGraph.nodes.length > 0 && (
              <div className="p-4 border rounded-lg bg-white shadow-sm">
                <h3 className="text-lg font-semibold mb-3">📋 函数列表</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {callGraph.nodes.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => setSelectedFunction(node.name)}
                      className="text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded text-sm transition-colors"
                    >
                      <span className="font-medium">{node.name}</span>
                      <span className="block text-xs text-gray-500">{node.file}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 底部 */}
      <footer className="border-t bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-sm text-gray-500">
          基于 React + TypeScript + d3.js + IndexedDB 构建 | 纯 B/S 架构
        </div>
      </footer>
    </div>
  );
}
