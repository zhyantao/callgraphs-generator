/* queue.h - 简单的 int 队列 */
#ifndef QUEUE_H
#define QUEUE_H

#define QUEUE_CAPACITY 16

typedef struct {
    int buf[QUEUE_CAPACITY];
    int head;
    int tail;
    int count;
} Queue;

void queue_init(Queue *q);
int  queue_push(Queue *q, int value);
int  queue_pop(Queue *q);
int  queue_empty(const Queue *q);
void queue_clear(Queue *q);

#endif
