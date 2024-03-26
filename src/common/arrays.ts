export function sumUntil(list: number[], index: number): number {
    return list.reduce((prev, curr, i) => (i < index ? prev + curr : prev), 0);
}

export function sumAll(list: number[]): number {
    return list.reduce((prev, curr) => prev + curr, 0);
}
