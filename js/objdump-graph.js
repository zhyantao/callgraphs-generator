// objdump 反汇编文本解析 → 调用图（纯前端，无任何服务器依赖）
//
// 输入：`objdump -d <产物>` 的输出文本（GNU binutils 与 Apple/llvm objdump 均可）
// 原理：objdump 已完成反汇编与符号标注，只需提取两类信息：
//   1. 函数头 `0000000000401139 <main>:`  → 函数定义
//   2. 调用指令 `call/bl ... <目标符号>`   → 调用边
//
// 支持：
//   - 链接后的 ELF / Mach-O 可执行文件（推荐，调用关系最完整）
//   - 单个或多个 .o / .a 的反汇编文本（objdump 会按成员分段输出）
//   - 多文件上传自动合并，跨文件调用自动关联

// ------------------------------------------------------------- 文本解析

/** 调用助记符（x86 / ARM64 / ARM32 / RISC-V 等） */
const CALL_MNEMONICS = new Set([
  'call', 'callq', 'callw', 'calll',
  'bl', 'blx', 'jal', 'jalr', 'jsr', 'bsr',
]);

/** 函数头：`0000000000401139 <main>:` / `0000000100000460 <_main>:` */
const FUNC_HEADER_RE = /^\s*[0-9a-fA-F]+\s+<([^+>]+)>:\s*$/;

/** 调用行（标注允许带 +offset）：`call 401128 <helper>` / `bl 0x10000072c <_queue_init>` */
const CALL_INSN_RE =
  /^\s*[0-9a-fA-F]+:\s+(?:[0-9a-fA-F]{2,}\s+)*([a-zA-Z][a-zA-Z0-9.]*)\s+\S*\s*<([^+>]+?)(?:\+[0-9a-fA-Fx]+)?>\s*(?:#.*)?$/;

/** 重定位行（objdump -dr 内联输出）：`d9: R_X86_64_PLT32 is_even-0x4` / `00000034: ARM64_RELOC_BRANCH26 _helper` */
const RELOC_LINE_RE =
  /^\s*([0-9a-fA-F]+):\s+((?:[A-Z0-9]+_)?(?:RELOC|PLT)[A-Z0-9_]*|R_[A-Z0-9_]+)\s+([A-Za-z_$][\w$.]*)/;
const CALL_RELOC_RE = /PLT|CALL|BRANCH|JUMP|PC32/i;

/** Mach-O 段标签（不是真函数） */
const SECTION_LABEL_RE = /^__(stubs|text|got|const|data|bss|cstring|objc|eh_frame|unwind|gcc_except_tab|auth_got)/;

/** 成员分段头：`demo.elf: file format mach-o arm64` */
const MEMBER_HEADER_RE = /^(.+?):[ \t]+file format (.+)$/;

/** llvm 局部标签等噪声符号 */
function isNoise(name) {
  return /^l(tmp)?[0-9_]*$/.test(name) || /^l_/.test(name) || name === '';
}

function splitMembers(text) {
  const lines = text.split('\n');
  const bodies = [];
  let current = null;
  let sawHeader = false;

  for (const line of lines) {
    const m = line.match(MEMBER_HEADER_RE);
    if (m && !/^[0-9a-fA-F]+:/.test(m[1])) {
      if (current) bodies.push(current);
      current = { name: m[1].trim(), lines: [] };
      sawHeader = true;
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) bodies.push(current);

  // 没有成员头（用户可能裁剪过首行）→ 整体当一个成员
  if (!sawHeader) return [{ name: 'unknown', body: text }];
  return bodies.map((b) => ({ name: b.name, body: b.lines.join('\n') }));
}

function parseObjdumpText(file, text) {
  const members = splitMembers(text);

  // Mach-O 判定：符号名前导下划线占比
  let macho = false;
  const allNames = [];
  for (const m of members) {
    for (const line of m.body.split('\n')) {
      const h = line.match(FUNC_HEADER_RE);
      if (h) allNames.push(h[1]);
    }
  }
  if (allNames.length > 0) {
    macho = allNames.filter((n) => n.startsWith('_')).length / allNames.length > 0.6;
  }
  const demangle = (n) => (macho && n.startsWith('_') ? n.slice(1) : n);

  const definedFunctions = new Set();
  const rawEdges = [];
  const seen = new Set();

  for (const member of members) {
    let currentFn = '';
    for (const line of member.body.split('\n')) {
      const header = line.match(FUNC_HEADER_RE);
      if (header) {
        const name = demangle(header[1].trim());
        currentFn = name;
        if (!isNoise(name) && !SECTION_LABEL_RE.test(header[1].trim())) {
          definedFunctions.add(name);
        }
        continue;
      }
      if (!currentFn) continue;

      // 1) 调用指令行
      const insn = line.match(CALL_INSN_RE);
      if (insn && CALL_MNEMONICS.has(insn[1].toLowerCase())) {
        const caller = currentFn;
        const callee = demangle(insn[2].trim());
        if (!isNoise(caller) && !isNoise(callee) && caller !== callee) {
          const key = `${caller}=>${callee}`;
          if (!seen.has(key)) {
            seen.add(key);
            rawEdges.push({ caller, callee });
          }
        }
        continue;
      }

      // 2) 重定位行（objdump -dr，.o 目标文件的关键来源）
      const rel = line.match(RELOC_LINE_RE);
      if (rel && CALL_RELOC_RE.test(rel[2])) {
        const caller = currentFn;
        const callee = demangle(rel[3].replace(/[+-]0x[0-9a-fA-F]+$/, '').replace(/-\d+$/, ''));
        if (!isNoise(caller) && !isNoise(callee) && caller !== callee) {
          const key = `${caller}=>${callee}`;
          if (!seen.has(key)) {
            seen.add(key);
            rawEdges.push({ caller, callee });
          }
        }
      }
    }
  }

  return { file, definedFunctions: [...definedFunctions], rawEdges };
}

// ------------------------------------------------------------- 多产物汇总

function assembleGraph(results) {
  const nodes = [];
  const edges = [];
  const nodeIds = new Set();
  const edgeKeys = new Set();

  // 函数 → 定义所在产物
  const defLocation = new Map();
  for (const art of results) {
    for (const fn of art.definedFunctions) {
      if (!defLocation.has(fn)) defLocation.set(fn, art.file);
    }
  }

  const addNode = (name, file) => {
    const id = `${file}:${name}`;
    if (nodeIds.has(id)) return id;
    nodeIds.add(id);
    nodes.push({ id, name, file });
    return id;
  };

  for (const art of results) {
    for (const edge of art.rawEdges) {
      const callerId = addNode(edge.caller, art.file);
      const calleeFile = defLocation.get(edge.callee) || '(外部符号)';
      const calleeId = addNode(edge.callee, calleeFile);
      if (callerId === calleeId) continue;
      const key = `${callerId}->${calleeId}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({ caller: callerId, callee: calleeId });
    }
  }

  return { nodes, edges };
}
