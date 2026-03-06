import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

// 分析器脚本路径
const ANALYZER_SCRIPT = path.join(process.cwd(), 'analyze.py');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const files = body.files as { name: string; content: string }[];
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }
    
    // 创建临时目录
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'callgraph-'));
    
    try {
      // 写入所有文件
      const sourceFiles: string[] = [];
      for (const file of files) {
        const filePath = path.join(tempDir, file.name);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, file.content);
        
        const ext = path.extname(file.name).toLowerCase();
        if (['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'].includes(ext)) {
          sourceFiles.push(file.name);
        }
      }
      
      if (sourceFiles.length === 0) {
        return NextResponse.json({
          success: false,
          error: '没有找到 C/C++ 源文件'
        });
      }
      
      // 检测构建系统
      const buildSystem = detectBuildSystem(tempDir);
      console.log('Detected build system:', buildSystem);
      
      // 根据构建系统执行
      if (buildSystem === 'make') {
        return await buildWithMake(tempDir, sourceFiles);
      } else if (buildSystem === 'cmake') {
        return await buildWithCMake(tempDir);
      } else if (buildSystem === 'scons') {
        return await buildWithSCons(tempDir);
      } else {
        return analyzeWithPythonFromDir(tempDir);
      }
      
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Analysis failed: ' + String(error) },
      { status: 500 }
    );
  }
}

// 检测构建系统
function detectBuildSystem(tempDir: string): string {
  const files = fs.readdirSync(tempDir, { recursive: true });
  const fileNames = files.map(f => String(f).toLowerCase());
  
  if (fileNames.some(f => f === 'makefile' || f.endsWith('.mak'))) {
    return 'make';
  }
  
  if (fileNames.some(f => f === 'cmakelists.txt')) {
    return 'cmake';
  }
  
  if (fileNames.some(f => f === 'sconstruct' || f.endsWith('sconscript'))) {
    return 'scons';
  }
  
  return 'none';
}

// 使用 Make 编译并生成调用图
async function buildWithMake(tempDir: string, sourceFiles: string[]) {
  try {
    // 执行 make
    await execAsync('make clean && make', {
      cwd: tempDir,
      timeout: 120000
    });
    
    // 尝试使用 GCC RTL dump
    try {
      for (const srcFile of sourceFiles.filter(f => f.endsWith('.c') || f.endsWith('.cpp'))) {
        await execAsync(`gcc -fdump-rtl-expand -c "${srcFile}" -o /dev/null 2>&1`, {
          cwd: tempDir,
          timeout: 30000
        });
      }
    } catch {
      // RTL dump not available
    }
    
  } catch (error) {
    console.error('Make error:', error);
  }
  
  return analyzeWithPythonFromDir(tempDir);
}

// 使用 CMake 编译并生成调用图
async function buildWithCMake(tempDir: string) {
  const buildDir = path.join(tempDir, 'build');
  
  try {
    fs.mkdirSync(buildDir, { recursive: true });
    await execAsync('cmake ..', { cwd: buildDir, timeout: 60000 });
    await execAsync('cmake --build .', { cwd: buildDir, timeout: 120000 });
  } catch (error) {
    console.error('CMake error:', error);
  }
  
  return analyzeWithPythonFromDir(tempDir);
}

// 使用 SCons 编译并生成调用图
async function buildWithSCons(tempDir: string) {
  try {
    await execAsync('scons', { cwd: tempDir, timeout: 120000 });
  } catch (error) {
    console.error('SCons error:', error);
  }
  
  return analyzeWithPythonFromDir(tempDir);
}

// 从目录中的文件生成调用图
async function analyzeWithPythonFromDir(tempDir: string) {
  const files: { name: string; content: string }[] = [];
  
  const readDir = (dir: string) => {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          readDir(fullPath);
        } else {
          const ext = path.extname(item).toLowerCase();
          if (['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'].includes(ext)) {
            const relPath = path.relative(tempDir, fullPath);
            files.push({
              name: relPath,
              content: fs.readFileSync(fullPath, 'utf-8')
            });
          }
        }
      }
    } catch {
      // ignore
    }
  };
  
  readDir(tempDir);
  
  if (files.length === 0) {
    return NextResponse.json({
      success: false,
      error: '没有找到源文件'
    });
  }
  
  return analyzeWithPython(files);
}

// 使用 Python 脚本分析
async function analyzeWithPython(files: { name: string; content: string }[]) {
  try {
    const inputData = { files };
    const inputStr = JSON.stringify(inputData);
    
    const { stdout } = await execAsync(
      `echo '${inputStr}' | python3 "${ANALYZER_SCRIPT}"`,
      { timeout: 60000 }
    );
    
    const result = JSON.parse(stdout);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Python analysis failed:', error);
    return simpleAnalyze(files);
  }
}

// 简单的静态分析（内置备用）
function simpleAnalyze(files: { name: string; content: string }[]) {
  const nodes: Array<{ id: string; name: string; file: string; line?: number }> = [];
  const edges: Array<{ caller: string; callee: string; line?: number }> = [];
  
  const knownLibFunctions = new Set([
    'printf', 'scanf', 'malloc', 'free', 'memcpy', 'strlen', 'strcmp',
    'strcpy', 'strcat', 'memset', 'memcmp', 'fopen', 'fclose', 'fread', 'fwrite'
  ]);
  
  const keywords = new Set(['if', 'while', 'for', 'switch', 'return', 'sizeof', 'typedef', 'struct', 'class', 'enum', 'union']);
  
  const functionDefPatterns = [
    /^\s*(?:static\s+|inline\s+|virtual\s+|extern\s+|constexpr\s+)*\s*(?:void|int|char|float|double|bool|long|short|unsigned|signed)\s*\*?\s*(\w+)\s*\([^)]*\)\s*(?:const)?\s*\{/gm,
    /^\s*(\w+)\s*\([^)]*\)\s*\{/gm,
  ];
  
  const allFunctions = new Map<string, { file: string; line: number }>();
  
  for (const file of files) {
    const lines = file.content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.trim().startsWith('//') || line.trim().startsWith('/*')) continue;
      
      for (const pattern of functionDefPatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(line);
        
        if (match) {
          const funcName = match[1];
          if (!knownLibFunctions.has(funcName) && !keywords.has(funcName)) {
            const key = `${file.name}:${funcName}`;
            if (!allFunctions.has(key)) {
              allFunctions.set(key, { file: file.name, line: i + 1 });
              
              nodes.push({
                id: key,
                name: funcName,
                file: file.name,
                line: i + 1
              });
            }
          }
        }
      }
    }
  }
  
  // 收集函数调用
  for (const file of files) {
    const lines = file.content.split('\n');
    let currentFunc = '';
    let braceCount = 0;
    const callPattern = /\b(\w+)\s*\(/g;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const pattern of functionDefPatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(line);
        
        if (match) {
          const funcName = match[1];
          if (!knownLibFunctions.has(funcName) && !keywords.has(funcName)) {
            currentFunc = funcName;
            braceCount = 0;
          }
        }
      }
      
      if (currentFunc) {
        braceCount += (line.match(/\{/g) || []).length;
        braceCount -= (line.match(/\}/g) || []).length;
        
        callPattern.lastIndex = 0;
        let match;
        while ((match = callPattern.exec(line)) !== null) {
          const calledFunc = match[1];
          
          if (!knownLibFunctions.has(calledFunc) && 
              !keywords.has(calledFunc) && 
              calledFunc !== currentFunc) {
            
            for (const [funcKey, funcInfo] of allFunctions) {
              if (funcInfo.file === file.name && funcKey.endsWith(`:${calledFunc}`)) {
                const callerKey = `${file.name}:${currentFunc}`;
                
                const edgeExists = edges.some(e => 
                  e.caller === callerKey && e.callee === funcKey
                );
                
                if (!edgeExists) {
                  edges.push({
                    caller: callerKey,
                    callee: funcKey,
                    line: i + 1
                  });
                }
              }
            }
          }
        }
        
        if (braceCount <= 0 && line.includes('}')) {
          currentFunc = '';
        }
      }
    }
  }
  
  // 跨文件调用
  for (const file of files) {
    const lines = file.content.split('\n');
    let currentFunc = '';
    let braceCount = 0;
    const callPattern = /\b(\w+)\s*\(/g;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const pattern of functionDefPatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(line);
        
        if (match) {
          const funcName = match[1];
          if (!knownLibFunctions.has(funcName) && !keywords.has(funcName)) {
            currentFunc = funcName;
            braceCount = 0;
          }
        }
      }
      
      if (currentFunc) {
        braceCount += (line.match(/\{/g) || []).length;
        braceCount -= (line.match(/\}/g) || []).length;
        
        callPattern.lastIndex = 0;
        let match;
        while ((match = callPattern.exec(line)) !== null) {
          const calledFunc = match[1];
          
          if (!knownLibFunctions.has(calledFunc) && 
              !keywords.has(calledFunc) && 
              calledFunc !== currentFunc) {
            
            for (const [funcKey, funcInfo] of allFunctions) {
              if (funcInfo.file !== file.name && funcKey.endsWith(`:${calledFunc}`)) {
                const callerKey = `${file.name}:${currentFunc}`;
                
                const edgeExists = edges.some(e => 
                  e.caller === callerKey && e.callee === funcKey
                );
                
                if (!edgeExists) {
                  edges.push({
                    caller: callerKey,
                    callee: funcKey,
                    line: i + 1
                  });
                }
              }
            }
          }
        }
        
        if (braceCount <= 0 && line.includes('}')) {
          currentFunc = '';
        }
      }
    }
  }
  
  return NextResponse.json({
    success: true,
    data: {
      nodes,
      edges
    }
  });
}
