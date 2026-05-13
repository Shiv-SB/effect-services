import { LCG } from "./random";

/*const ProbabiltyOfFalsePos = (
    m: number,  // size of array
    k: number,  // no of hash functions
    n: number,  // no of expected elements inserted
): number => {
    const inner = (1 - (1 / m));
    const innerExp = Math.pow(inner, k * n);
    return Math.pow(1 - innerExp, k);
}*/

const SizeOfBitArray = (
    n: number,  // no of expected elements inserted
    p: number,  // desired false probability
): number => {
    const upper = n * Math.log(p) * -1;
    const lower = Math.LN2 ** 2
    return Math.ceil(upper / lower);
}

const OptimumNoOfHashFuncs = (
    m: number,  // size of bit array
    n: number   // number of elements inserted
): number => Math.ceil((m * Math.LN2) / n);

/*const generate_n_hash_funcs = (
    n: number
) => {
    type HashArg = Parameters<typeof Bun["hash"]["murmur32v3"]>[0];
    type HashFunc = (data: HashArg) => number;
    const lcg = new LCG();
    const funcs: HashFunc[] = [];

    for (let i = 0; i < n; i++) {
        const seed = lcg.randomInt(100_000, 900_000);
        const hashFunc = (data: HashArg) => Bun.hash.murmur32v3(data, seed);
        funcs.push(hashFunc);
    }

    return funcs;
}*/

interface BloomFilterArgs {
    item_count: number;
    fp_prob?: number
}

interface BloomFilterImpl {
    insert: (item: string) => void;
    has: (item: string) => boolean;
}

class BloomFilter implements BloomFilterImpl {
    private item_count: number;
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

        this.item_count = item_count;
        this.fp_prob = fp_prob;

        this.size = SizeOfBitArray(item_count, fp_prob);
        this.hash_count = OptimumNoOfHashFuncs(this.size, item_count);

        console.log(this.item_count, this.fp_prob, this.size, this.hash_count);

        const byteSize = Math.ceil(this.size / 8);
        this.bits = Buffer.alloc(byteSize, 0);
    }

    private getBit = (index: number): boolean => {
        const byteIdx = Math.floor(index / 8);
        const bitIdx = index % 8;
        return (this.bits[byteIdx] & (1 << bitIdx)) !== 0;
    }

    private setBit = (index: number) => {
        const byteIdx = Math.floor(index / 8);
        const bitIdx = index % 8;
        this.bits[byteIdx] |= (1 << bitIdx);
    }

    public insert = (item: string) => {
        const h1 = this.hasher(item, 0);
        const h2 = this.hasher(item, 1);

        for (let i = 0; i < this.hash_count; i++) {
            const digest = ((h1 + i * h2) % this.size + this.size) % this.size;
            this.setBit(digest);
        }
        console.log(this.bits);
    }

    public has = (item: string) => {
        const h1 = Bun.hash.murmur32v3(item, 0);
        const h2 = Bun.hash.murmur32v3(item, 1);

        for (let i = 0; i < this.hash_count; i++) {
            const digest =
                ((h1 + i * h2) % this.size + this.size) % this.size;

            if (!this.getBit(digest)) {
                return false;
            }
        }
        return true;
    }
}

const filter = new BloomFilter({ item_count: 3 });

filter.insert("Jane Doe");
filter.insert("John Doe");
filter.insert("Foo");

console.log(filter.has("Jane Doe"));
console.log(filter.has("John Doe"));
console.log(filter.has("John Williams"));
console.log(filter.has("Foo"));
console.log(filter.has("foo"));

