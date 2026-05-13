//#region Types & Classes

export interface BloomFilterArgs {
    /**
     * Expected maximum number of inserted items.
    */
   
    item_count: number;
    /**
     * Desired false positive probabilty
     * 
     * Must be a value between 0 and 1.
     *@default 0.01
    */
    fp_prob?: number;
}

export interface BloomFilterImpl {
    /**
     * Inserts an item into the Bloom filter.
     *
     * Multiple hash digests are generated for the item and corresponding bits
     * are marked in the backing bit array.
     *
     * @param item Item to insert.
    */
    insert: (item: string) => void;

    /**
     * Checks whether an item may exist in the Bloom filter.
     *
     * Results:
     * - `false` means the item definitely does not exist.
     * - `true` means the item may exist.
     *
     * @param item Item to test.
     * @returns Membership probability result.
     */
    has: (item: string) => boolean;
}

export interface ScalableBloomFilterArgs extends BloomFilterArgs {
    growthFactor?: number;
}