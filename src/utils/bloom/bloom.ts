import { BloomFilterImpl, BloomFilterArgs } from "./common";

const SizeOfBitArray = (
    n: number,
    p: number,
): number => {
    const upper = n * Math.log(p) * -1;
    const lower = Math.LN2 ** 2;
    return Math.ceil(upper / lower);
};

const OptimumNoOfHashFuncs = (
    m: number,
    n: number,
): number => Math.max(1, Math.ceil((m * Math.LN2) / n));

export class BloomFilter implements BloomFilterImpl {
    private capacity: number;
    private inserted = 0;

    private fp_prob: number;
    private size: number;
    private hash_count: number;

    private bits: Buffer<ArrayBuffer>;
    private hasher = Bun.hash.murmur32v3;

    constructor(args: BloomFilterArgs) {
        const {
            item_count,
            fp_prob = 0.01,
        } = args;

        this.capacity = item_count;
        this.fp_prob = fp_prob;

        this.size = SizeOfBitArray(item_count, fp_prob);
        this.hash_count = OptimumNoOfHashFuncs(
            this.size,
            item_count,
        );

        const byteSize = Math.ceil(this.size / 8);

        this.bits = Buffer.alloc(byteSize, 0);

        console.log({
            capacity: this.capacity,
            fp_prob: this.fp_prob,
            size_bits: this.size,
            size_bytes: byteSize,
            hash_count: this.hash_count,
        });
    }

    public isAtCapacity = (): boolean =>
        this.inserted >= this.capacity;

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
            (this.bits[byteIdx] & (1 << bitIdx)) !== 0
        );
    };

    private setBit = (index: number): void => {
        const byteIdx = Math.floor(index / 8);
        const bitIdx = index % 8;

        this.bits[byteIdx] |= (1 << bitIdx);
    };

    public insert = (item: string): void => {
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