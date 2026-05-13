function rotl32(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function fmix32(hash: number): number {
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);

  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);

  hash ^= hash >>> 16;

  return hash >>> 0;
}

/**
 * MurmurHash3 x86 32-bit
 *
 * @param key - Input bytes
 * @param seed - Seed value
 * @returns Unsigned 32-bit hash
 */
export function murmur3_32(
  key: Uint8Array,
  seed: number = 0
): number {
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  const r1 = 15;
  const r2 = 13;
  const m = 5;
  const n = 0xe6546b64;

  const len = key.length;
  const nblocks = Math.floor(len / 4);

  let hash = seed >>> 0;

  // Process 4-byte chunks (little-endian)
  for (let i = 0; i < nblocks; i++) {
    const offset = i * 4;

    let k =
      (key[offset]! & 0xff) |
      ((key[offset + 1]! & 0xff) << 8) |
      ((key[offset + 2]! & 0xff) << 16) |
      ((key[offset + 3]! & 0xff) << 24);

    k = Math.imul(k, c1);
    k = rotl32(k, r1);
    k = Math.imul(k, c2);

    hash ^= k;
    hash = rotl32(hash, r2);
    hash = (Math.imul(hash, m) + n) >>> 0;
  }

  // Tail
  let k1 = 0;
  const tailIndex = nblocks * 4;

  switch (len & 3) {
    // @ts-expect-error impl requires fallthrough
    case 3:
      k1 ^= (key[tailIndex + 2]! & 0xff) << 16;
    // fallthrough

    // @ts-expect-error impl requires fallthrough
    case 2:
      k1 ^= (key[tailIndex + 1]! & 0xff) << 8;
    // fallthrough

    case 1:
      k1 ^= key[tailIndex]! & 0xff;

      k1 = Math.imul(k1, c1);
      k1 = rotl32(k1, r1);
      k1 = Math.imul(k1, c2);

      hash ^= k1;
  }

  // Finalization
  hash ^= len;
  hash = fmix32(hash);

  return hash >>> 0;
}