'use client';

import { useState, useCallback } from 'react';
import { saveSourceFile, getSourceFiles } from '@/app/lib/db';

interface FileUploaderProps {
  onFilesLoaded?: (files: { name: string; content: string }[]) => void;
}

export default function FileUploader({ onFilesLoaded }: FileUploaderProps) {
  const [files, setFiles] = useState<{ name: string; content: string; id?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // 解压 ZIP 文件 - 解压所有文件，并移除最外层目录
  const extractZipContent = async (file: File): Promise<{ name: string; content: string }[]> => {
    const JSZip = (await import('jszip')).default;
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const result: { name: string; content: string }[] = [];
    
    // 收集所有文件
    const zipFiles: { name: string; path: unknown }[] = [];
    
    zip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir) {
        zipFiles.push({ name: relativePath, path: zipEntry });
      }
    });
    
    // 找出最外层目录
    let rootDir = '';
    if (zipFiles.length > 0) {
      const firstPath = zipFiles[0].name;
      const parts = firstPath.split('/');
      if (parts.length > 1) {
        rootDir = parts[0];
      }
    }
    
    // 解压每个文件
    for (const fileInfo of zipFiles) {
      try {
        const content = await (fileInfo.path as { async(type: string): Promise<string> }).async('text');
        
        // 移除最外层目录
        let fileName = fileInfo.name;
        if (rootDir && fileName.startsWith(rootDir + '/')) {
          fileName = fileName.substring(rootDir.length + 1);
        }
        
        if (fileName) {
          result.push({ name: fileName, content });
        }
      } catch {
        // 可能是二进制文件，跳过
      }
    }
    
    return result;
  };

  // 处理文件选择
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    setLoading(true);
    // 清除之前的缓存
    setFiles([]);
    const newFiles: { name: string; content: string }[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const fileName = file.name.toLowerCase();
      
      try {
        if (fileName.endsWith('.zip')) {
          // 解压 ZIP 文件 - 移除最外层目录
          const extracted = await extractZipContent(file);
          newFiles.push(...extracted);
          setMessage(`从压缩包提取了 ${extracted.length} 个文件`);
        } else {
          // 普通文件
          const content = await file.text();
          newFiles.push({ name: file.name, content });
        }
      } catch (error) {
        console.error('处理文件失败:', file.name, error);
        setMessage(`处理文件失败: ${file.name}`);
      }
    }

    setFiles(newFiles);
    if (newFiles.length > 0) {
      setMessage(`已添加 ${newFiles.length} 个文件`);
    }
    setLoading(false);
    
    if (onFilesLoaded) {
      onFilesLoaded(newFiles);
    }
  }, [onFilesLoaded]);

  // 保存到 IndexedDB
  const handleSave = useCallback(async () => {
    setLoading(true);
    try {
      for (const file of files) {
        await saveSourceFile(file.name, file.content);
      }
      setMessage('文件已保存到数据库');
    } catch (error) {
      setMessage('保存失败');
      console.error(error);
    }
    setLoading(false);
  }, [files]);

  // 导出到本地 ZIP 文件
  const handleExport = useCallback(async () => {
    if (files.length === 0) {
      setMessage('没有可导出的文件');
      return;
    }

    setLoading(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      
      for (const file of files) {
        zip.file(file.name, file.content);
      }
      
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `source_files_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setMessage('文件已导出到本地');
    } catch (error) {
      setMessage('导出失败');
      console.error(error);
    }
    setLoading(false);
  }, [files]);

  // 加载已保存的文件
  const handleLoad = useCallback(async () => {
    setLoading(true);
    try {
      const savedFiles = await getSourceFiles();
      const fileData = savedFiles.map(f => ({
        name: f.name,
        content: f.content,
        id: f.id,
      }));
      setFiles(fileData);
      setMessage(`已加载 ${fileData.length} 个保存的文件`);
      
      if (onFilesLoaded) {
        onFilesLoaded(fileData.map(f => ({ name: f.name, content: f.content })));
      }
    } catch (error) {
      setMessage('加载失败');
      console.error(error);
    }
    setLoading(false);
  }, [onFilesLoaded]);

  // 删除文件
  const handleRemove = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setMessage('');
  }, []);

  // 清除所有文件
  const handleClear = useCallback(() => {
    setFiles([]);
    setMessage('');
  }, []);

  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-4">📁 代码管理</h2>
      
      {/* 文件上传 */}
      <div className="mb-4">
        <label className="block mb-2 text-sm font-medium">
          上传源文件或压缩包
        </label>
        <input
          type="file"
          multiple
          accept=".c,.cpp,.h,.hpp,.cc,.cxx,.hxx,.txt,.mak,.py,.sh,.zip"
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100"
        />
        <p className="text-xs text-gray-500 mt-1">
          支持源文件、Makefile、CMakeLists.txt、SConstruct 等
        </p>
      </div>

      {/* 已选文件列表 */}
      {files.length > 0 && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium">已选文件 ({files.length})</h3>
            <button
              onClick={handleClear}
              className="text-xs text-red-500 hover:text-red-700"
            >
              清除全部
            </button>
          </div>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {files.map((file, index) => (
              <li key={index} className="flex justify-between items-center text-sm bg-gray-50 px-3 py-2 rounded">
                <span>📄 {file.name}</span>
                <button
                  onClick={() => handleRemove(index)}
                  className="text-red-500 hover:text-red-700 text-xs"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleSave}
          disabled={loading || files.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700 text-sm"
        >
          💾 保存到数据库
        </button>
        <button
          onClick={handleExport}
          disabled={loading || files.length === 0}
          className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50 hover:bg-green-700 text-sm"
        >
          📥 导出到本地
        </button>
        <button
          onClick={handleLoad}
          disabled={loading}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
        >
          📂 加载已保存
        </button>
        <button
          onClick={handleClear}
          disabled={loading || files.length === 0}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
        >
          🗑️ 清空列表
        </button>
      </div>

      {/* 状态消息 */}
      {message && (
        <p className="mt-3 text-sm text-gray-600">{message}</p>
      )}
    </div>
  );
}
