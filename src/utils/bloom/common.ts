//#region Types & Classes

export interface BloomFilterArgs {
    item_count: number;
    fp_prob?: number;
}

export interface BloomFilterImpl {
    insert: (item: string) => void;
    has: (item: string) => boolean;
}

export interface ScalableBloomFilterArgs extends BloomFilterArgs {
    growthFactor?: number;
}