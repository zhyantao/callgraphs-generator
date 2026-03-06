// C/C++ 代码分析器 - 解析函数调用关系

export interface FunctionNode {
  id: string;
  name: string;
  file: string;
  line?: number;
}

export interface FunctionCall {
  caller: string;
  callee: string;
  line?: number;
}

export interface CallGraphResult {
  nodes: FunctionNode[];
  edges: FunctionCall[];
}

// 常见的库函数
const knownLibFunctions = new Set([
  'printf', 'scanf', 'sprintf', 'sscanf', 'fprintf', 'fscanf', 'snprintf',
  'malloc', 'calloc', 'realloc', 'free', 'memcpy', 'memmove', 'memset', 'memcmp', 'memchr',
  'strcpy', 'strncpy', 'strcat', 'strncat', 'strcmp', 'strncmp', 'strlen', 'strchr', 'strrchr', 'strstr',
  'fopen', 'fclose', 'fread', 'fwrite', 'fgets', 'fputs', 'feof', 'ferror', 'ftell', 'fseek', 'rewind',
  'exit', 'abort', 'atexit', 'system', 'getenv', 'setenv',
  'time', 'clock', 'difftime', 'mktime', 'strftime',
  'assert', 'static_assert',
  'cout', 'cin', 'cerr', 'endl', 'flush',
  'make_shared', 'make_unique', 'shared_ptr', 'unique_ptr', 'weak_ptr',
  'begin', 'end', 'size', 'empty', 'push_back', 'pop_back', 'front', 'back',
]);

// 关键字
const keywords = new Set(['if', 'while', 'for', 'switch', 'return', 'sizeof', 'new', 'delete', 'throw', 'try', 'catch', 'typedef', 'using', 'namespace', 'struct', 'class', 'enum', 'union']);

function isKnownLibFunction(name: string): boolean {
  return knownLibFunctions.has(name);
}

function isKeyword(name: string): boolean {
  return keywords.has(name);
}

// 解析单个文件
export function analyzeSingleFile(code: string, filename: string): CallGraphResult {
  const nodes: FunctionNode[] = [];
  const edges: FunctionCall[] = [];
  
  const lines = code.split('\n');
  const definedFunctions = new Map<string, number>();
  
  // 匹配函数定义 - 更简单的正则
  const funcDefPattern = /^\s*(?:static\s+|inline\s+|virtual\s+|extern\s+|constexpr\s+)*\s*(?:void|int|char|float|double|bool|long|short|unsigned|signed)\s+\*?\s*(\w+)\s*\([^)]*\)\s*(?:const)?\s*\{/;
  
  // 匹配函数调用
  const callPattern = /\b(\w+)\s*\(/g;
  
  // 第一遍：找函数定义
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 跳过控制结构
    if (line.match(/^\s*(if|while|for|switch)\s*\(/)) continue;
    if (line.match(/^\s*(return|sizeof)\s/)) continue;
    
    const match = line.match(funcDefPattern);
    if (match) {
      const funcName = match[1];
      if (!isKnownLibFunction(funcName) && !isKeyword(funcName)) {
        definedFunctions.set(funcName, i + 1);
        nodes.push({
          id: `${filename}:${funcName}`,
          name: funcName,
          file: filename,
          line: i + 1,
        });
      }
    }
    
    // 也匹配构造函数形式: ClassName() {
    const ctorMatch = line.match(/^\s*(\w+)\s*\([^)]*\)\s*\{/);
    if (ctorMatch) {
      const funcName = ctorMatch[1];
      if (!isKnownLibFunction(funcName) && !isKeyword(funcName) && !definedFunctions.has(funcName)) {
        definedFunctions.set(funcName, i + 1);
        nodes.push({
          id: `${filename}:${funcName}`,
          name: funcName,
          file: filename,
          line: i + 1,
        });
      }
    }
  }
  
  // 第二遍：找函数调用
  let currentFunc = '';
  let braceCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 检测函数定义开始
    let match = line.match(funcDefPattern);
    if (!match) {
      match = line.match(/^\s*(\w+)\s*\([^)]*\)\s*\{/);
    }
    
    if (match) {
      const funcName = match[1];
      if (!isKnownLibFunction(funcName) && !isKeyword(funcName)) {
        currentFunc = funcName;
        braceCount = 0;
      }
    }
    
    if (currentFunc) {
      // 计数大括号
      for (const c of line) {
        if (c === '{') braceCount++;
        if (c === '}') braceCount--;
      }
      
      // 提取函数调用
      callPattern.lastIndex = 0;
      let callMatch;
      while ((callMatch = callPattern.exec(line)) !== null) {
        const calledFunc = callMatch[1];
        
        if (!isKnownLibFunction(calledFunc) && !isKeyword(calledFunc) && calledFunc !== currentFunc) {
          // 检查被调用函数是否存在
          if (definedFunctions.has(calledFunc)) {
            const edgeExists = edges.some(e => 
              e.caller === `${filename}:${currentFunc}` && 
              e.callee === `${filename}:${calledFunc}`
            );
            
            if (!edgeExists) {
              edges.push({
                caller: `${filename}:${currentFunc}`,
                callee: `${filename}:${calledFunc}`,
                line: i + 1,
              });
            }
          }
        }
      }
      
      // 函数结束
      if (braceCount === 0 && line.includes('}') && currentFunc) {
        currentFunc = '';
      }
    }
  }
  
  return { nodes, edges };
}

// 多文件分析
export function analyzeMultipleFiles(files: { name: string; content: string }[]): CallGraphResult {
  const allNodes: FunctionNode[] = [];
  const allEdges: FunctionCall[] = [];
  
  // 第一步：解析所有文件
  const fileResults: Array<{ filename: string; result: CallGraphResult }> = [];
  
  for (const file of files) {
    const result = analyzeSingleFile(file.content, file.name);
    fileResults.push({ filename: file.name, result });
    allNodes.push(...result.nodes);
  }
  
  // 第二步：建立函数索引
  const funcIndex = new Map<string, FunctionNode>();
  for (const node of allNodes) {
    funcIndex.set(node.name, node);
  }
  
  // 第三步：添加跨文件调用
  for (const { result } of fileResults) {
    for (const edge of result.edges) {
      const calleeName = edge.callee.split(':').pop()!;
      const calleeNode = funcIndex.get(calleeName);
      
      if (calleeNode && edge.caller !== calleeNode.id) {
        // 检查边是否已存在
        const edgeExists = allEdges.some(e => 
          e.caller === edge.caller && e.callee === calleeNode.id
        );
        
        if (!edgeExists) {
          allEdges.push({
            caller: edge.caller,
            callee: calleeNode.id,
            line: edge.line,
          });
        }
      }
    }
  }
  
  return { nodes: allNodes, edges: allEdges };
}
