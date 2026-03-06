import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

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
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compile-'));
    let buildLog = '';
    
    try {
      // 写入所有文件（不仅仅是源代码）
      const sourceFiles: string[] = [];
      for (const file of files) {
        const filePath = path.join(tempDir, file.name);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, file.content);
        
        // 记录源文件
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
      
      buildLog += `找到 ${sourceFiles.length} 个源文件:\n`;
      for (const f of sourceFiles) {
        buildLog += `  - ${f}\n`;
      }
      buildLog += '\n';
      
      // 检测构建系统
      const buildSystem = detectBuildSystem(tempDir);
      buildLog += `检测到构建系统: ${buildSystem}\n\n`;
      
      if (buildSystem === 'make') {
        return await buildWithMake(tempDir, buildLog);
      } else if (buildSystem === 'cmake') {
        return await buildWithCMake(tempDir, buildLog);
      } else if (buildSystem === 'scons') {
        return await buildWithSCons(tempDir, buildLog);
      } else if (buildSystem === 'autotools') {
        return await buildWithAutotools(tempDir, buildLog);
      } else {
        return await buildWithGCC(tempDir, sourceFiles, buildLog);
      }
      
    } finally {
      // 清理临时目录
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    
  } catch (error) {
    console.error('Compilation error:', error);
    return NextResponse.json(
      { error: 'Compilation failed: ' + String(error) },
      { status: 500 }
    );
  }
}

// 检测构建系统
function detectBuildSystem(tempDir: string): string {
  const files = fs.readdirSync(tempDir, { recursive: true });
  const fileNames = files.map(f => String(f).toLowerCase());
  
  // Makefile
  if (fileNames.some(f => f === 'makefile' || f.endsWith('.mak'))) {
    return 'make';
  }
  
  // CMake
  if (fileNames.some(f => f === 'cmakelists.txt')) {
    return 'cmake';
  }
  
  // SCons
  if (fileNames.some(f => f === 'sconstruct' || f.endsWith('sconscript'))) {
    return 'scons';
  }
  
  // Autotools
  if (fileNames.some(f => f === 'configure' || f === 'configure.ac' || f === 'configure.in' || f === 'Makefile.in')) {
    return 'autotools';
  }
  
  // Meson
  if (fileNames.some(f => f === 'meson.build' || f === 'meson.options')) {
    return 'meson';
  }
  
  // Ninja
  if (fileNames.some(f => f === 'build.ninja')) {
    return 'ninja';
  }
  
  return 'none';
}

// 使用 Make 编译
async function buildWithMake(tempDir: string, buildLog: string) {
  try {
    buildLog += '=== 使用 Makefile 编译 ===\n\n';
    
    // 先尝试 clean
    try {
      await execAsync('make clean', { cwd: tempDir, timeout: 30000 });
      buildLog += 'make clean 完成\n';
    } catch {
      // ignore
    }
    
    // 执行 make
    buildLog += '\n执行 make...\n';
    const { stdout, stderr } = await execAsync('make', {
      cwd: tempDir,
      timeout: 120000
    });
    
    if (stdout) buildLog += stdout + '\n';
    if (stderr) buildLog += '警告:\n' + stderr + '\n';
    
    buildLog += '\n✓ Make 编译完成\n';
    
  } catch (makeError: unknown) {
    const err = makeError as { stdout?: string; stderr?: string; message?: string };
    buildLog += '\n✗ Make 错误:\n';
    if (err.stdout) buildLog += err.stdout;
    if (err.stderr) buildLog += err.stderr;
    buildLog += '\n' + (err.message || '');
  }
  
  // 检查生成的可执行文件
  return checkGeneratedFiles(tempDir, buildLog);
}

// 使用 CMake 编译
async function buildWithCMake(tempDir: string, buildLog: string) {
  const buildDir = path.join(tempDir, 'build');
  
  try {
    buildLog += '=== 使用 CMake 编译 ===\n\n';
    
    fs.mkdirSync(buildDir, { recursive: true });
    
    // CMake 配置
    buildLog += '执行 cmake ..\n';
    const { stdout: cmakeOut, stderr: cmakeErr } = await execAsync('cmake ..', {
      cwd: buildDir,
      timeout: 60000
    });
    
    if (cmakeOut) buildLog += cmakeOut + '\n';
    if (cmakeErr) buildLog += 'CMake 警告: ' + cmakeErr + '\n';
    
    // CMake 构建
    buildLog += '\n执行 cmake --build .\n';
    const { stdout: buildOut, stderr: buildErr } = await execAsync('cmake --build .', {
      cwd: buildDir,
      timeout: 120000
    });
    
    if (buildOut) buildLog += buildOut + '\n';
    if (buildErr) buildLog += '构建警告: ' + buildErr + '\n';
    
    buildLog += '\n✓ CMake 编译完成\n';
    
  } catch (cmakeError: unknown) {
    const err = cmakeError as { stdout?: string; stderr?: string; message?: string };
    buildLog += '\n✗ CMake 错误:\n';
    if (err.stdout) buildLog += err.stdout;
    if (err.stderr) buildLog += err.stderr;
    buildLog += '\n' + (err.message || '');
  }
  
  return checkGeneratedFiles(tempDir, buildLog);
}

// 使用 SCons 编译
async function buildWithSCons(tempDir: string, buildLog: string) {
  try {
    buildLog += '=== 使用 SCons 编译 ===\n\n';
    
    // 检查是否有 scons
    try {
      await execAsync('which scons', { cwd: tempDir });
    } catch {
      buildLog += '警告: scons 未安装，尝试使用 python3 -m scons\n';
    }
    
    const { stdout, stderr } = await execAsync('scons', {
      cwd: tempDir,
      timeout: 120000
    });
    
    if (stdout) buildLog += stdout + '\n';
    if (stderr) buildLog += '警告:\n' + stderr + '\n';
    
    buildLog += '\n✓ SCons 编译完成\n';
    
  } catch (sconsError: unknown) {
    const err = sconsError as { stdout?: string; stderr?: string; message?: string };
    buildLog += '\n✗ SCons 错误:\n';
    if (err.stdout) buildLog += err.stdout;
    if (err.stderr) buildLog += err.stderr;
    buildLog += '\n' + (err.message || '');
  }
  
  return checkGeneratedFiles(tempDir, buildLog);
}

// 使用 Autotools 编译
async function buildWithAutotools(tempDir: string, buildLog: string) {
  try {
    buildLog += '=== 使用 Autotools 编译 ===\n\n';
    
    // 检查 configure 脚本
    const hasConfigure = fs.existsSync(path.join(tempDir, 'configure'));
    
    if (!hasConfigure) {
      // 尝试运行 autoreconf
      buildLog += '生成 configure 脚本...\n';
      await execAsync('autoreconf -i', { cwd: tempDir, timeout: 60000 });
    }
    
    // 运行 configure
    buildLog += '\n执行 ./configure...\n';
    await execAsync('./configure', { cwd: tempDir, timeout: 60000 });
    
    // 编译
    buildLog += '\n执行 make...\n';
    const { stdout, stderr } = await execAsync('make', {
      cwd: tempDir,
      timeout: 120000
    });
    
    if (stdout) buildLog += stdout + '\n';
    if (stderr) buildLog += '警告:\n' + stderr + '\n';
    
    buildLog += '\n✓ Autotools 编译完成\n';
    
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    buildLog += '\n✗ Autotools 错误:\n';
    if (err.stdout) buildLog += err.stdout;
    if (err.stderr) buildLog += err.stderr;
    buildLog += '\n' + (err.message || '');
  }
  
  return checkGeneratedFiles(tempDir, buildLog);
}

// 使用 GCC 直接编译
async function buildWithGCC(tempDir: string, sourceFiles: string[], buildLog: string) {
  // 查找主函数文件
  let mainFile = '';
  
  for (const srcFile of sourceFiles) {
    const content = fs.readFileSync(path.join(tempDir, srcFile), 'utf-8');
    if (content.includes('int main(') || content.includes('void main(')) {
      mainFile = srcFile;
      break;
    }
  }
  
  if (!mainFile && sourceFiles.length > 0) {
    mainFile = sourceFiles[0];
  }
  
  if (!mainFile) {
    return NextResponse.json({
      success: false,
      error: '没有找到可编译的源文件'
    });
  }
  
  try {
    buildLog += '=== 使用 GCC 直接编译 ===\n\n';
    buildLog += `主文件: ${mainFile}\n\n`;
    
    const outputName = 'a.out';
    const compileCmd = `gcc -o ${outputName} "${mainFile}" -pthread 2>&1`;
    
    buildLog += `执行: ${compileCmd}\n`;
    
    const { stdout, stderr } = await execAsync(compileCmd, {
      cwd: tempDir,
      timeout: 60000
    });
    
    if (stdout) buildLog += stdout + '\n';
    if (stderr) buildLog += stderr + '\n';
    
    // 检查输出文件
    const outputPath = path.join(tempDir, outputName);
    if (fs.existsSync(outputPath)) {
      buildLog += `\n✓ 编译成功！输出文件: ${outputName}\n`;
    }
    
  } catch (compileError: unknown) {
    const err = compileError as { stderr?: string; message?: string };
    buildLog += '\n✗ 编译错误:\n';
    buildLog += err.stderr || err.message || '';
  }
  
  return checkGeneratedFiles(tempDir, buildLog);
}

// 检查生成的文件
function checkGeneratedFiles(tempDir: string, buildLog: string) {
  const exeFiles: string[] = [];
  const objectFiles: string[] = [];
  
  const scanDir = (dir: string) => {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // 跳过 build 目录
          if (item !== 'build') {
            scanDir(fullPath);
          }
        } else {
          // 检查是否是可执行文件或对象文件
          const ext = path.extname(item).toLowerCase();
          if (ext === '.o' || ext === '.obj') {
            objectFiles.push(item);
          } else if (stat.mode & 0o111) {
            // 可执行文件
            exeFiles.push(item);
          }
        }
      }
    } catch {
      // ignore
    }
  };
  
  scanDir(tempDir);
  
  if (exeFiles.length > 0 || objectFiles.length > 0) {
    buildLog += '\n生成的文件:\n';
    for (const f of exeFiles) {
      buildLog += `  📦 ${f} (可执行)\n`;
    }
    for (const f of objectFiles) {
      buildLog += `  🔧 ${f} (对象文件)\n`;
    }
  }
  
  return NextResponse.json({
    success: true,
    log: buildLog
  });
}
