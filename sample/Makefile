# 示例项目构建脚本
# 用法:
#   make           本机编译，产出 demo.elf
#   make dump      编译并生成 objdump 反汇编文本 demo.dump（上传网站用）
#   make arm64     交叉编译 Linux aarch64 产物（需要对应工具链）
#   make clean     清理
CC      ?= cc
OBJDUMP ?= objdump
CFLAGS  = -O0 -g -Wall
# 交叉编译示例前缀（按需修改成你自己的工具链）
CROSS   ?= aarch64-linux-gnu-

TARGET  = demo.elf
DUMP    = demo.dump
OBJS    = main.o queue.o math-utils.o

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

# 生成网站所需的 objdump 反汇编文本
dump: $(TARGET)
	$(OBJDUMP) -d $(TARGET) > $(DUMP)
	@echo "已生成 $(DUMP)，拖入网站即可解析"

arm64:
	$(CROSS)gcc $(CFLAGS) -o demo-arm64.elf main.c queue.c math-utils.c
	$(CROSS)objdump -d demo-arm64.elf > demo-arm64.dump
	@echo "已生成 demo-arm64.dump"

clean:
	rm -f $(OBJS) $(TARGET) demo-arm64.elf demo-arm64.dump $(DUMP)

.PHONY: all dump arm64 clean
