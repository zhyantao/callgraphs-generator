# 示例项目：本地编译 → 生成 objdump 文本 → 上传网站解析

这是一个小的多文件 C 项目，用来演示本网站的完整工作流：

```
本地编译 → objdump -d 生成反汇编文本 → 上传网站 → 自动生成调用关系图
```

网站**纯前端解析**（不需要服务器），解析结果 100% 来自 objdump 的真实反汇编与符号标注。

## 项目结构

```
sample/
├── main.c           程序入口：任务队列 + 命令分发
├── queue.c/.h       简单 int 队列
├── math-utils.c/.h  数学工具（fib / gcd / add）
└── Makefile         构建脚本（含 make dump 一键生成上传文件）
```

## 快速开始（macOS / Linux）

```bash
cd sample
make dump          # 编译 demo.elf 并生成 demo.dump
```

然后把 `demo.dump` 拖进网站上传区，点「解析调用关系」即可。

## 手动步骤（不用 Makefile 也行）

### 1. 本地编译

任选一种方式，在你自己的机器上编译：

```bash
# 本机编译
gcc -O0 -g -o demo.elf main.c queue.c math-utils.c
# 或 clang
clang -O0 -g -o demo.elf main.c queue.c math-utils.c
```

先跑一下确认正常：`./demo.elf`，应输出三行计算结果。

### 2. 生成 objdump 反汇编文本

```bash
# Linux 下的 ELF（最常用）
objdump -d demo.elf > demo.dump

# macOS 上分析 Mach-O 可执行文件（系统自带 objdump）
objdump -d demo.elf > demo.dump

# 交叉编译产物：用对应工具链的 objdump
aarch64-linux-gnu-objdump -d demo-arm64.elf > demo-arm64.dump

# 目标文件 / 静态库（Linux ELF 适用，注意加 -r）
objdump -dr main.o > main.dump
objdump -dr libdemo.a > libdemo.dump
```

### 3. 上传网站

把 `demo.dump` 拖入网站上传区 → 点「解析调用关系」。
多个 dump 文件可同时上传，跨文件调用会自动关联。

## 预期的调用关系

```
main ──> queue_init / queue_push / queue_empty / queue_pop / queue_clear
     ──> dispatch ──> handle_add ──> math_add
                 ──> handle_fib ──> fib_iter ──> math_add
                 ──> handle_gcd ──> gcd ──> is_even
printf / strcmp / memset ──> (外部符号)
```

## 注意事项

- 编译时**不要加 `-s`，不要 `strip`** —— 需要符号表，否则 objdump 标注不出函数名
- `-O0 -g` 的产物调用关系最清晰；高优化等级会内联小函数，图中会相应少一些边
- 函数指针 / 间接调用无法通过静态分析识别，不会出现在图中
- **macOS 用户注意**：Mach-O 的 `.o` / `.a` 反汇编文本不含真实函数名（只有 ltmp 标签），
  请一律对**链接后的可执行文件**执行 `objdump -d`；Linux ELF 则可执行文件 / .o / .a 都支持
