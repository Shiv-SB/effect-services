import { Redacted } from "effect";

export type RedactedOr<T> = Redacted.Redacted<T> | T;

/**
 * If the given secret is a Redacted string, get the value,
 * otherwise return the secret.
 */
export function unwravel<T>(secret: RedactedOr<T>): T {
    if (Redacted.isRedacted(secret)) return Redacted.value(secret);
    return secret;
}

export type SearchParamInput = ConstructorParameters<typeof URLSearchParams>[0];

export function removeOrigin(url: URL): string {
    return url.pathname + url.search;
}