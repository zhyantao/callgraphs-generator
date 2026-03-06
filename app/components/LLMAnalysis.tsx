'use client';

import { useState } from 'react';

interface LLMAnalysisProps {
  functionName: string;
  callGraph: {
    nodes: Array<{ id: string; name: string; file: string }>;
    edges: Array<{ caller: string; callee: string }>;
  };
  onClose?: () => void;
}

interface AnalysisResult {
  functionName: string;
  file: string;
  functionType: string;
  purpose: {
    description: string;
    details: string;
  };
  callGraph: {
    callers: string[];
    callees: string[];
    totalCallers: number;
    totalCallees: number;
  };
}

export default function LLMAnalysis({ functionName, callGraph, onClose }: LLMAnalysisProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const response = await fetch('/api/llm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          functionName,
          callGraph,
        }),
      });

      if (!response.ok) {
        throw new Error('分析请求失败');
      }

      const result = await response.json();
      if (result.success) {
        // 只保留需要的字段
        const data = result.data;
        setAnalysis({
          functionName: data.functionName,
          file: data.file,
          functionType: data.functionType,
          purpose: data.purpose,
          callGraph: data.callGraph,
        });
      } else {
        throw new Error(result.error || '分析失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">🤖 智能分析</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-600 mb-2">
          分析函数: <strong>{functionName}</strong>
        </p>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg disabled:opacity-50 hover:bg-purple-700"
        >
          {loading ? '分析中...' : '🔍 开始分析'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {analysis && (
        <div className="space-y-4">
          {/* 函数基本信息 */}
          <div className="p-3 bg-blue-50 rounded-lg">
            <h3 className="text-sm font-semibold text-blue-800 mb-2">📋 基本信息</h3>
            <div className="text-sm text-blue-700 space-y-1">
              <p><strong>函数名:</strong> {analysis.functionName}</p>
              <p><strong>文件:</strong> {analysis.file}</p>
              <p><strong>函数类型:</strong> <span className="px-2 py-0.5 bg-blue-200 rounded text-xs">{analysis.functionType}</span></p>
            </div>
          </div>

          {/* 函数功能 */}
          <div className="p-3 bg-green-50 rounded-lg">
            <h3 className="text-sm font-semibold text-green-800 mb-2">🎯 函数功能</h3>
            <p className="text-sm text-green-700">{analysis.purpose.description}</p>
            <p className="text-sm text-green-600 mt-2">{analysis.purpose.details}</p>
          </div>

          {/* 调用关系摘要 */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">🔗 调用关系</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-gray-700">调用者 (父函数): {analysis.callGraph.totalCallers}</p>
                {analysis.callGraph.callers.length > 0 ? (
                  <ul className="text-gray-600 mt-1 space-y-1">
                    {analysis.callGraph.callers.map((caller, i) => (
                      <li key={i} className="text-xs">↗ {caller}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">无</p>
                )}
              </div>
              <div>
                <p className="font-medium text-gray-700">被调用者 (子函数): {analysis.callGraph.totalCallees}</p>
                {analysis.callGraph.callees.length > 0 ? (
                  <ul className="text-gray-600 mt-1 space-y-1">
                    {analysis.callGraph.callees.map((callee, i) => (
                      <li key={i} className="text-xs">↘ {callee}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">无</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
