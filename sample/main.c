/* main.c - 程序入口：命令解析 -> 任务队列 -> 数学运算 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "queue.h"
#include "math-utils.h"

static void handle_add(int a, int b) {
    int r = math_add(a, b);
    printf("add(%d, %d) = %d\n", a, b, r);
}

static void handle_fib(int n) {
    int r = fib_iter(n);
    printf("fib(%d) = %d\n", n, r);
}

static void handle_gcd(int a, int b) {
    int r = gcd(a, b);
    printf("gcd(%d, %d) = %d\n", a, b, r);
}

/* 分发表：演示 switch 分支调用不同处理函数 */
static void dispatch(const char *cmd, int a, int b) {
    if (strcmp(cmd, "add") == 0) {
        handle_add(a, b);
    } else if (strcmp(cmd, "fib") == 0) {
        handle_fib(a);
    } else if (strcmp(cmd, "gcd") == 0) {
        handle_gcd(a, b);
    } else {
        printf("unknown command: %s\n", cmd);
    }
}

int main(int argc, char **argv) {
    Queue q;
    queue_init(&q);

    /* 入队三个任务 */
    queue_push(&q, 0);   /* add    */
    queue_push(&q, 1);   /* fib    */
    queue_push(&q, 2);   /* gcd    */

    while (!queue_empty(&q)) {
        int task = queue_pop(&q);
        switch (task) {
            case 0: dispatch("add", 3, 4);    break;
            case 1: dispatch("fib", 10, 0);   break;
            case 2: dispatch("gcd", 48, 36);  break;
        }
    }

    queue_clear(&q);
    return EXIT_SUCCESS;
}
