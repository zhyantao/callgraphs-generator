# C/C++ 代码调用关系分析工具

基于浏览器的 C/C++ 代码调用关系分析工具，无需安装，通过网页访问即可使用。

## 功能特性

### 1. 代码管理
- 支持上传 C/C++ 源文件 (.c, .cpp, .h, .hpp, .cc, .cxx, .hxx)
- 支持上传 ZIP 压缩包（自动解压）
- 将代码保存到浏览器 IndexedDB 数据库
- 从数据库加载已保存的代码
- 导出/导入源代码文件

### 2. 调用关系分析
- 解析函数定义和调用
- 构建函数调用关系网络
- 使用 D3.js 生成可视化调用关系图
- 支持拖拽、缩放等交互

### 3. 智能分析
- 基于调用关系图分析函数类型
- 推测函数功能
- 展示调用者/被调用者关系

### 4. 编译功能
- 自动检测构建系统（Makefile / CMake / SCons）
- 执行编译并显示编译日志
- 支持直接用 GCC 编译

## 技术栈

- **前端框架**: Next.js 15 (React 19 + TypeScript)
- **数据存储**: IndexedDB
- **可视化**: D3.js
- **样式**: Tailwind CSS
- **构建工具**: Next.js

## 项目结构

```
callgraphs-generator/
├── app/
│   ├── api/
│   │   ├── analyze/      # 代码分析 API
│   │   ├── compile/      # 编译 API
│   │   └── llm/          # 智能分析 API
│   ├── components/
│   │   ├── CallGraphViewer.tsx   # 调用关系图可视化
│   │   ├── FileUploader.tsx       # 文件上传组件
│   │   └── LLMAnalysis.tsx        # 智能分析组件
│   ├── lib/
│   │   ├── analyzer.ts    # 代码分析器
│   │   └── db.ts          # IndexedDB 操作
│   ├── page.tsx           # 主页面
│   └── layout.tsx         # 布局
├── analyze.py             # Python 调用关系分析器
├── package.json
└── next.config.ts
```

## 安装

```bash
cd callgraphs-generator
npm install
```

## 开发

```bash
npm run dev
```

访问 http://localhost:3000

## 生产构建

```bash
npm run build
```

构建输出在 `out/` 目录。

## 使用方法

1. **上传代码**: 点击"上传源文件"选择 .c/.cpp/.h 文件，或上传 ZIP 压缩包
2. **分析代码**: 点击"开始分析"生成调用关系图
3. **查看关系**: 在可视化图中查看函数调用关系，点击函数节点进行智能分析
4. **编译代码**: 点击"编译代码"使用 Makefile/CMake/SCons 编译，显示编译日志
5. **保存/导出**: 可以保存到数据库或导出到本地文件

## API

### POST /api/analyze
分析代码生成调用关系图

Request:
```json
{
  "files": [
    { "name": "main.c", "content": "..." }
  ]
}
```

Response:
```json
{
  "success": true,
  "data": {
    "nodes": [{ "id": "main.c:main", "name": "main", "file": "main.c", "line": 1 }],
    "edges": [{ "caller": "main.c:main", "callee": "main.c:foo", "line": 5 }]
  }
}
```

### POST /api/compile
编译代码

### POST /api/llm
智能分析函数

## 依赖

- Node.js 18+
- npm 9+
- Python 3 (用于调用关系分析)
- GCC/Clang (用于编译)

## License

MIT
