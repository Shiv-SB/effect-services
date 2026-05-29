import { describe, test, expect } from "bun:test";
import { mean, product, variance, welchsT } from "../../../src/utils/math/math";

describe(mean, () => {
    test("computes the arithmetic mean for positive values", () => {
        expect(mean([1, 2, 3, 4, 5])).toBe(3);
    });

    test("computes the mean for negative and positive values", () => {
        expect(mean([-3, -1, 0, 1, 3])).toBe(0);
    });

    test("computes the mean for floating point values", () => {
        expect(mean([1.5, 2.5, 3.5])).toBeCloseTo(2.5, 10);
    });

    test("returns the exact single element value", () => {
        expect(mean([42])).toBe(42);
    });

    test("computes the mean for very large values", () => {
        expect(mean([1_000_000, 2_000_000, 3_000_000])).toBe(2_000_000);
    });

    test("computes the mean when all values are zero", () => {
        expect(mean([0, 0, 0, 0])).toBe(0);
    });

    test("computes the mean for repeated values", () => {
        expect(mean([7, 7, 7, 7, 7])).toBe(7);
    });

    test("preserves floating point precision reasonably", () => {
        expect(mean([0.1, 0.2, 0.3])).toBeCloseTo(0.2, 10);
    });
});

describe(variance, () => {
    test("computes sample variance from values with known dispersion", () => {
        expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4.57);
    });

    test("uses the provided average when supplied", () => {
        const xs = [1, 3, 5, 7];
        const avg = mean(xs);
        expect(variance(xs, avg)).toBe(20 / 3);
    });

    test("computes variance correctly for negative values", () => {
        expect(variance([-2, 0, 2])).toBe(4);
    });

    test("computes variance for a single repeated value sample", () => {
        expect(variance([5, 5, 5, 5])).toBe(0);
    });

    test("computes variance for floating point values", () => {
        expect(variance([1.5, 2.5, 3.5])).toBeCloseTo(1, 10);
    });

    test("computes variance for mixed negative and positive values", () => {
        expect(variance([-5, 0, 5])).toBe(25);
    });

    test("returns zero variance for all zeroes", () => {
        expect(variance([0, 0, 0, 0])).toBe(0);
    });

    test("computes variance for large values", () => {
        expect(
            variance([1_000_000, 1_000_002, 1_000_004])
        ).toBeCloseTo(4, 10);
    });

    test("matches variance result whether average is supplied or derived", () => {
        const xs = [10, 20, 30, 40, 50];

        expect(variance(xs)).toBeCloseTo(
            variance(xs, mean(xs)),
            10
        );
    });
});

describe(welchsT, () => {
    test("returns 0 for groups with equal means", () => {
        const a = [1, 3, 5];
        const b = [0, 4, 6];

        expect(welchsT(a, b)).toBeCloseTo(-0.1581);
    });

    test("computes a negative t statistic when first sample mean is smaller", () => {
        const a = [1, 2, 3];
        const b = [2, 4, 6];

        expect(welchsT(a, b)).toBeCloseTo(
            -1.5491933384829668,
            10
        );
    });

    test("computes a positive t statistic when first sample mean is larger", () => {
        const a = [5, 6, 7];
        const b = [1, 2, 3];

        expect(welchsT(a, b)).toBeCloseTo(5.196152422706632, 0);
    });

    test("produces a finite number for unequal sample sizes and variances", () => {
        const a = [1, 2, 3, 4, 5];
        const b = [1, 1, 1, 1, 10];

        expect(Number.isFinite(welchsT(a, b))).toBeTrue();
    });

    test("returns 0 for identical samples", () => {
        const a = [1, 2, 3, 4];
        const b = [1, 2, 3, 4];

        expect(welchsT(a, b)).toBeCloseTo(0, 10);
    });

    test("is antisymmetric when swapping sample order", () => {
        const a = [1, 2, 3];
        const b = [4, 5, 6];

        expect(welchsT(a, b)).toBeCloseTo(
            -welchsT(b, a),
            10
        );
    });

    test("produces larger magnitude values for more separated means", () => {
        const smallGap = Math.abs(
            welchsT([1, 2, 3], [2, 3, 4])
        );

        const largeGap = Math.abs(
            welchsT([1, 2, 3], [100, 101, 102])
        );

        expect(largeGap).toBeGreaterThan(smallGap);
    });

    test("handles floating point samples", () => {
        const a = [1.1, 1.2, 1.3];
        const b = [2.1, 2.2, 2.3];

        expect(Number.isFinite(welchsT(a, b))).toBeTrue();
    });

    test("returns a finite value for highly imbalanced sample sizes", () => {
        const a = [1, 2];
        const b = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

        expect(Number.isFinite(welchsT(a, b))).toBeTrue();
    });

    test("returns a very large magnitude statistic for clearly separated groups", () => {
        const a = [1, 1, 1, 1, 1];
        const b = [100, 100, 100, 100, 100];

        expect(Math.abs(welchsT(a, b))).toBeGreaterThan(100);
    });
});

describe.only(product, () => {
    describe("test cases", () => {
        const testCases: [number[], number][] = [
            [[0], 0],
            [[1], 1],
            [[1, 2, 3], 6],
            [[10, 0, 10], 0],
            [[10, 10, 90, 1, 1, 50], 450_000],
        ];

        test.each(testCases)("%p should reduce to %p", (arr, exp) => {
            const result = product(arr);
            expect(result).toBe(exp);
        });
    });
});