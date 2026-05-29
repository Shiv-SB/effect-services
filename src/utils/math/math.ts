/**
 * Compute the arithmetic mean of a numeric array.
 *
 * @param xs - The list of numbers to average.
 * @returns The mean value of the input numbers.
 */
export const mean = (xs: number[]): number =>
    xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Compute the sample variance of a numeric array.
 *
 * Uses Bessel's correction by dividing by `n - 1` when calculating
 * the variance for a sample.
 *
 * @param xs - The list of numbers to compute variance for.
 * @param avg - Optional precomputed mean of `xs`.
 * @returns The sample variance of the input numbers.
 */
export const variance = (xs: number[], avg = mean(xs)): number =>
    xs.reduce((acc, x) => acc + (x - avg) ** 2, 0) /
    (xs.length - 1);

/**
 * Compute Welch's t-statistic for two independent samples with unequal variances.
 *
 * @param a - The first sample of numbers.
 * @param b - The second sample of numbers.
 * @returns The Welch t-statistic comparing the two samples.
 */
export const welchsT = (a: number[], b: number[]): number => {
    const meanA = mean(a);
    const meanB = mean(b);

    const varA = variance(a, meanA);
    const varB = variance(b, meanB);

    return (
        (meanA - meanB) /
        Math.sqrt(varA / a.length + varB / b.length)
    );
};

export const product = (xs: number[]): number => {
    return xs.reduce((a, b) => a * b, 1);
}

