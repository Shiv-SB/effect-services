import { BloomFilter } from "./bloom";
import type { BloomFilterImpl, ScalableBloomFilterArgs } from "./common";

/**
 * A Scalable Bloom Filter implementation that dynamically grows by adding
 * new Bloom filter layers as capacity is reached.
 *
 * Unlike a standard Bloom filter with a fixed size and false-positive rate,
 * this structure maintains accuracy over time by:
 * - Adding new filters when existing ones become full
 * - Reducing the false-positive probability per layer to keep the overall
 *   cumulative false-positive rate bounded
 *
 * ### Characteristics
 * - **Unbounded growth**: Automatically expands to accommodate more items
 * - **Layered structure**: Internally maintains multiple Bloom filters
 * - **Controlled false positives**: Each additional layer lowers its individual
 *   false-positive rate to preserve the overall target probability
 *
 * ### Use cases
 * - Long-lived datasets with unknown or growing size
 * - High-throughput ETL or streaming systems
 * - Deduplication where memory efficiency is critical
 *
 * @example
 * ```ts
 * const filter = new ScalableBloomFilter({
 *   item_count: 1000,
 *   fp_prob: 0.01,
 *   growthFactor: 2,
 * });
 *
 * filter.insert("foo");
 *
 * console.log(filter.has("foo")); // true
 * console.log(filter.has("bar")); // possibly false
 * ```
 *
 */
export class ScalableBloomFilter
    implements BloomFilterImpl {

    private filters: BloomFilter[] = [];

    private fpProb: number;
    private growthFactor: number;

    constructor(args: ScalableBloomFilterArgs) {
        const {
            item_count,
            fp_prob = 0.01,
            growthFactor = 2,
        } = args;

        this.fpProb = fp_prob;
        this.growthFactor = growthFactor;

        this.filters.push(
            new BloomFilter({
                item_count,
                fp_prob,
            }),
        );
    }

    private getCurrentFilter = (): BloomFilter => this.filters[this.filters.length - 1]!;

    private grow = (): void => {
        const current = this.getCurrentFilter();

        const nextCapacity = Math.ceil(
            current.getCapacity() * this.growthFactor,
        );

        // Reduce FP rate per layer so cumulative FP probability
        // remains bounded
        const nextFpProb = this.fpProb / (this.filters.length + 1);

        /*console.log("Growing bloom filter", {
            nextCapacity,
            nextFpProb,
        });*/

        this.filters.push(
            new BloomFilter({
                item_count: nextCapacity,
                fp_prob: nextFpProb,
            }),
        );
    };

    public insert = (item: string): void => {
        let current = this.getCurrentFilter();

        if (current.isAtCapacity()) {
            this.grow();
            current = this.getCurrentFilter();
        }

        current.insert(item);
    };

    public has = (item: string): boolean => {
        for (const filter of this.filters) {
            if (filter.has(item)) {
                return true;
            }
        }

        return false;
    };

    public debug = (): void => {
        console.log({
            layers: this.filters.length,
        });
    };
}