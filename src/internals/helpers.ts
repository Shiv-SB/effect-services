import { Redacted } from "effect";
import { Effect, DateTime } from "effect";

/**
 * A type that represents either `T` or a Redacted `T`.
 *
 * @template `T=string`
 */
export type RedactedOr<T = string> = Redacted.Redacted<T> | T;

/**
 * If the given secret is a Redacted string, get the value,
 * otherwise return the secret.
 */
export const unravel = <T>(
    secret: RedactedOr<T>
): T => Redacted.isRedacted(secret) ? Redacted.value(secret) : secret;

export type SearchParamInput = ConstructorParameters<typeof URLSearchParams>[0];

export function removeOrigin(url: URL): string {
    return url.pathname + url.search;
}

export const NowInMs: Effect.Effect<number> = DateTime.now.pipe(Effect.map((utc) => utc.epochMilliseconds));