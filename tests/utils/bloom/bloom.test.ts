import * as B from "bun:test";
import { BloomFilter } from '../../../src/utils/bloom/bloom';
import { BloomFilterImpl } from '../../../src/utils/bloom/common';

const wordsSet = new Set([
    "abound", "abounds", "abundance",
    "abundant", "accessible", "bloom",
    "blossom", "bolster", "bonny",
    "bonus", "bonuses", "coherent",
    "cohesive", "colorful", "comely",
    "comfort", "gems", "generosity",
    "generous", "generously", "genial",
    "bluff", "cheater", "hate",
    "war", "humanity", "racism",
    "hurt", "nuke", "gloomy",
    "facebook", "keyboard", "twitter"
]);

B.describe(BloomFilter, () => {
    B.test("should correctly initialise", () => {
        const filter = new BloomFilter({ item_count: 1 });
        B.expect(filter).toBeInstanceOf(BloomFilter);
        B.expect(filter.getCapacity()).toBe(1);
        B.expect(filter.currentSize).toBe(0);
    });

    B.test("should not insert invalid items", () => {
        const testCases = [
            undefined,
            null,
            0,
            100,
            true,
            false,
            ["foo"],
            [],
            { foo: "bar" },
        ] as unknown as string[];

        const filter = new BloomFilter({ item_count: 1 });

        for (const x of testCases) {
            filter.insert(x);
        }

        B.expect(filter.currentSize).toBe(0);
    });

    B.describe("should insert items correctly", () => {
        const filter = new BloomFilter({ item_count: 20 });

        const includedWords: string[] = [
            "abound", "abounds", "abundance",
            "abundant", "accessible", "bloom",
            "blossom", "bolster", "bonny",
        ];

        const discludedWords: string[] = [
            "Abound", "Abounds", "abund",
            "a", "acc", "boom",
            "Bloss", "bolsters", "bony"
        ];

        for (const w of includedWords) {
            filter.insert(w);
        }

        B.test("should have correct size", () => {
            B.expect(filter.currentSize).toBe(includedWords.length);
        });

        B.test.each(includedWords)("should inclue %p", (str) => {
            B.expect(filter.has(str)).toBeTrue();
        });

        B.test.each(discludedWords)("should not include %p", (str) => {
            B.expect(filter.has(str)).toBeFalse();
        });
    });

    B.test("should flag when at capacity", () => {
        const filter = new BloomFilter({ item_count: 1 });
        B.expect(filter.isAtCapacity()).toBeFalse();
        filter.insert("foo!");
        B.expect(filter.isAtCapacity()).toBeTrue();
    });
});