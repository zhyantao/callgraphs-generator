/* queue.c - 队列实现（演示文件间的调用关系） */
#include <string.h>
#include "queue.h"

void queue_init(Queue *q) {
    memset(q, 0, sizeof(Queue));
}

int queue_push(Queue *q, int value) {
    if (q->count >= QUEUE_CAPACITY) {
        return -1;
    }
    q->buf[q->tail] = value;
    q->tail = (q->tail + 1) % QUEUE_CAPACITY;
    q->count++;
    return 0;
}

int queue_pop(Queue *q) {
    if (q->count == 0) {
        return -1;
    }
    int value = q->buf[q->head];
    q->head = (q->head + 1) % QUEUE_CAPACITY;
    q->count--;
    return value;
}

int queue_empty(const Queue *q) {
    return q->count == 0;
}

void queue_clear(Queue *q) {
    q->head = q->tail = q->count = 0;
}
