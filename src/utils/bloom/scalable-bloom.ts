import { BloomFilter } from "./bloom";
import type { BloomFilterImpl, ScalableBloomFilterArgs } from "./common";

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