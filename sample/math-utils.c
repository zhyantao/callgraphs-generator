/* math-utils.c - 数学工具实现（is_even 被 gcd 调用，形成多层调用链） */
int math_add(int a, int b) {
    return a + b;
}

int is_even(int x) {
    return (x & 1) == 0;
}

/* 迭代版斐波那契 */
int fib_iter(int n) {
    if (n <= 1) return n;
    int prev = 0, curr = 1;
    for (int i = 2; i <= n; i++) {
        int next = math_add(prev, curr);
        prev = curr;
        curr = next;
    }
    return curr;
}

/* 辗转相除法求最大公约数 */
int gcd(int a, int b) {
    if (a < 0) a = -a;
    if (b < 0) b = -b;
    while (b != 0) {
        if (is_even(a) && is_even(b)) {
            a >>= 1; b >>= 1;
            continue;
        }
        int r = a % b;
        a = b;
        b = r;
    }
    return a;
}
