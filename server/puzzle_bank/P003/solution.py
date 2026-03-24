def fib(n):
    a, b = 0, 1
    res = []
    for _ in range(n):
        res.append(str(a))
        a, b = b, a + b
    return " ".join(res)

print(fib(10))
