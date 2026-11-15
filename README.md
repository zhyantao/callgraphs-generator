# C/C++ 调用关系分析工具

上传本地 `objdump -d` 反汇编文本，在浏览器中精确提取 C/C++ 函数调用关系并可视化。
**纯静态站点：无需 Node、无需服务器、无需数据库** —— 静态托管（GitHub Pages）即可全功能使用。

## 快速开始

本项目就是一组静态文件，`index.html` 打开即用，**不需要任何安装或构建**。

```bash
# 方式一：直接双击 index.html（全部脚本为普通 script，file:// 下也能正常运行）
open index.html

# 方式二：任意静态服务器（推荐，浏览器本地存储能力完整）
python3 -m http.server 8000
# 访问 http://localhost:8000

# 方式三：npx serve（仅作静态服务器用，项目本身不依赖 Node）
npx serve .
```

> `file://` 直接打开时「保存/加载」等依赖浏览器本地数据库（IndexedDB）的功能
> 可能被浏览器限制，需要这些功能请用方式二/方式三。

## 使用流程

1. **本地编译**：在你自己的机器上编译项目（任意工具链）：

   ```bash
   gcc -O0 -g -o demo.elf main.c util.c      # 本机
   aarch64-linux-gnu-gcc -o demo demo.c      # 交叉编译
   ```

2. **生成反汇编文本**：

   ```bash
   objdump -d demo.elf > demo.dump
   ```

3. **上传解析**：把 `demo.dump` 拖进上传区 → 点「解析调用关系」

4. **查看/导出**：交互式调用图（拖拽、缩放），可在上传栏导出 ZIP 或导入调用图

## 目录结构

```
.
├── index.html            # 唯一页面（结构 + 图标引用）
├── css/style.css         # Tufte 主题样式（含 @font-face）
├── js/
│   ├── main.js           # 页面逻辑：上传、解析、保存/导出/导入
│   ├── objdump-graph.js  # objdump 文本解析 → 调用图（核心）
│   ├── viewer.js         # d3 力导向图渲染
│   ├── funclist.js       # 函数列表渲染
│   └── db.js             # IndexedDB 封装（浏览器本地存储）
├── vendor/               # 第三方库本地化（离线可用）
│   ├── d3.v7.min.js
│   └── jszip.min.js
├── fonts/et-book/        # 衬线正文字体（woff）
├── icons/                # 网站图标
│   ├── favicon.svg       # 矢量图标（现代浏览器）
│   ├── favicon.ico       # 16/32 多尺寸（兼容旧浏览器）
│   ├── favicon-16.png
│   ├── favicon-32.png
│   └── apple-touch-icon.png
├── sample/               # 可编译的示例项目 + 构建脚本
└── .nojekyll             # GitHub Pages 跳过 Jekyll 处理
```

所有资源引用均为**相对路径**（`./css/...`），因此部署到根路径或任意子路径（如
`/<repo>/`）都无需改配置。

## 示例项目

[`sample/`](./sample) 提供了可直接编译上传的示例（含 Makefile 与详细说明）：

```bash
cd sample
make dump        # 编译 demo.elf 并生成 demo.dump
# 把 demo.dump 拖进网站上传区
```

预期解析出 `main → dispatch → handle_* → math / fib / gcd → is_even` 等
14 条内部调用边，外加 printf/strcmp 等外部符号边。

## 支持的输入

| 输入 | 说明 |
|------|------|
| ELF 可执行文件 dump（Linux） | 从 `call <符号>` 提取，调用关系最完整（推荐） |
| Mach-O 可执行文件 dump（macOS） | 同上，自动处理符号下划线前缀 |
| `.o` / `.a` 的 dump | 需 `objdump -dr`（重定位行提供调用目标）；Linux ELF 有效 |
| 多文件 | 同时上传多个 dump，跨文件调用自动关联 |
| zip 压缩包 | 不支持，请逐个上传文本文件 |

## 技术要点

- **零依赖运行时**：HTML + CSS + 原生 JavaScript（普通 `script`，无框架无打包），第三方库（d3、JSZip）本地化
- **零后端**：objdump 已完成反汇编与符号标注，前端只做文本提取，结果精确
- **零数据库**：数据存浏览器 IndexedDB（`callgraphs-db`），不上传任何服务器

## 注意事项

- 产物需**保留符号表**（不要 `strip`、不要加 `-s`），否则 objdump 标注不出函数名
- 建议 `-O0 -g` 编译，高优化等级会内联小函数导致边减少
- 函数指针 / 间接调用无法通过静态反汇编识别
- macOS 的 Mach-O `.o`/`.a` 反汇编文本只有 ltmp 标签，请对**链接后的可执行文件**执行 `objdump -d`

## 部署

GitHub Pages 已配置自动部署（[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)）：
推送到 `master` 即上传整个仓库目录作为站点，**无需构建步骤**。

其他静态托管（Netlify / Vercel / Cloudflare Pages / Nginx）直接把仓库根目录作为发布目录即可。

## License

MIT
