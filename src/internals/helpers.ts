import { Redacted } from "effect";

/**
 * If the given secret is a Redacted string, get the value,
 * otherwise return the secret.
 */
export function unwravel(secret: Redacted.Redacted<string> | string): string {
    if (Redacted.isRedacted(secret)) return Redacted.value(secret);
    return secret;
}

export type SearchParamInput = ConstructorParameters<typeof URLSearchParams>[0];

export function removeOrigin(url: URL): string {
    return url.pathname + url.search;
}