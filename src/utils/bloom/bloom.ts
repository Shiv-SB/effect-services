import type { BloomFilterImpl, BloomFilterArgs } from "./common";
import { murmur3_32 } from '../../internals/hash';

const SizeOfBitArray = (
    n: number,  // expected no. of items
    p: number,  // false positive probability (0 - 1)
): number => {
    const upper = n * Math.log(p) * -1;
    const lower = Math.LN2 ** 2;
    return Math.ceil(upper / lower);
};

const OptimumNoOfHashFuncs = (
    m: number,  // bit array size
    n: number,  // expected no. of items
): number => Math.max(1, Math.ceil((m * Math.LN2) / n));

type HashFunction = (item: string, seed: number) => number;

/**
 * Probabilistic Bloom filter implementation.
 *
 * A Bloom filter is a space-efficient probabilistic data structure used to test
 * whether an element is a member of a set.
 *
 * If the actual item count exceeds the given `item_count`, the accuracy of the
 * filter will be dramatically reduced.
 * Consider using the `ScalableBloomFilter` for situations where
 * the initial item count is unknown.
 * 
 * Characteristics:
 * - False positives are possible.
 * - False negatives are not possible.
 * - Insert-only structure (no deletion support).
 *
 * This implementation uses:
 * - Double hashing for digest generation.
 * - The hashing algorithm used is Murmer V3 32 bit.
 * - A compact bit-packed buffer instead of an Array for storage.
 */
export class BloomFilter implements BloomFilterImpl {
    private capacity: number;
    private inserted = 0;

    private size: number;
    private hash_count: number;

    private bits: Buffer<ArrayBuffer>;
    private hasher: HashFunction;

    constructor(args: BloomFilterArgs) {
        const {
            item_count,
            fp_prob = 0.01,
        } = args;

        this.capacity = item_count;

        this.size = SizeOfBitArray(item_count, fp_prob);
        this.hash_count = OptimumNoOfHashFuncs(
            this.size,
            item_count,
        );

        const byteSize = Math.ceil(this.size / 8);

        this.bits = Buffer.alloc(byteSize, 0);

        this.hasher = process.versions.bun
            ? Bun.hash.murmur32v3
            : (item, seed) => murmur3_32(Buffer.from(item), seed);

        /*console.log({
            capacity: this.capacity,
            fp_prob: this.fp_prob,
            size_bits: this.size,
            size_bytes: byteSize,
            hash_count: this.hash_count,
        });*/
    }

    /**
     * Determines whether the filter has reached its configured capacity.
     *
     * Note:
     * Bloom filters can technically continue accepting inserts beyond capacity,
     * but false positive probability will increase beyond the configured target.
     *
     * @returns `true` if the configured capacity has been reached.
    */
    public isAtCapacity = (): boolean =>
        this.inserted >= this.capacity;

    /**
     * Gets the number of inserted items.
     *
     * @returns Current inserted item count.
    */
    public get currentSize() {
        return this.inserted;
    }

    /**
     * Gets the configured item capacity for the Bloom filter.
     *
     * @returns Maximum expected insert count.
    */
    public getCapacity = (): number =>
        this.capacity;

    private getDigest = (
        h1: number,
        h2: number,
        i: number,
    ): number =>
        ((h1 + i * h2) % this.size + this.size) % this.size;

    private getBit = (index: number): boolean => {
        const byteIdx = Math.floor(index / 8);
        const bitIdx = index % 8;

        return (
            (this.bits[byteIdx]! & (1 << bitIdx)) !== 0
        );
    };

    private setBit = (index: number): void => {
        const byteIdx = Math.floor(index / 8);
        const bitIdx = index % 8;

        this.bits[byteIdx]! |= (1 << bitIdx);
    };

    public insert = (item: string): void => {
        if (typeof item !== "string") return;
        const h1 = this.hasher(item, 0);
        const h2 = this.hasher(item, 1);

        for (let i = 0; i < this.hash_count; i++) {
            const digest = this.getDigest(h1, h2, i);
            this.setBit(digest);
        }

        this.inserted++;
    };

    public has = (item: string): boolean => {
        const h1 = this.hasher(item, 0);
        const h2 = this.hasher(item, 1);

        for (let i = 0; i < this.hash_count; i++) {
            const digest = this.getDigest(h1, h2, i);

            if (!this.getBit(digest)) {
                return false;
            }
        }

        return true;
    };
}