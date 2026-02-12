import * as Effect from "effect/Effect";
import * as Redacted from 'effect/Redacted';
import * as Ref from "effect/Ref";
import * as Option from "effect/Option";
import * as Context from "effect/Context";
import { FetchHttpClient, HttpBody, HttpClient, HttpClientRequest, HttpClientResponse, UrlParams } from "@effect/platform";
import { OauthResposneSchema, UploadDocumentRequestSchema } from "./schema";

type OAuthToken = {
    accessToken: string;
    refreshToken: string | null;
    expiresAt_epochMs: number;
}

export class ImanageConfig extends Context.Tag("effect-azure-kv/Imanage/index/ImanageConfig")<ImanageConfig, {
    readonly username: string;
    readonly password: Redacted.Redacted<string>;
    readonly client_id: string;
    readonly client_secret: Redacted.Redacted<string>;
    readonly baseURL: URL;
}>(){}

const authenticate = Effect.gen(function* () {
    const conf = yield* ImanageConfig;
    const payload = {
        grant_type: "password",
        username: conf.username,
        password: Redacted.value(conf.password),
        client_id: conf.client_id,
        client_secret: Redacted.value(conf.client_secret),
    }

    const unauthedClient = yield* HttpClient.HttpClient;

    const url = new URL("/auth/oauth2/token", conf.baseURL);

    const response = yield* unauthedClient.post(url, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: HttpBody.urlParams(UrlParams.fromInput(payload)),
    }).pipe(
        Effect.flatMap((res) => HttpClientResponse.schemaBodyJson(OauthResposneSchema)(res)),
    );

    return {
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        // subtract a little skew to be safe
        expiresAt_epochMs: Date.now() + (response.expires_in - 30) * 1000
    } satisfies OAuthToken;
});

const makeTokenManager = Effect.gen(function* () {
    const ref = yield* Ref.make<Option.Option<OAuthToken>>(Option.none());
    const mutex = yield* Effect.makeSemaphore(1);

    const getValidToken = Effect.gen(function* () {
        const now = Date.now();
        const cached = yield* Ref.get(ref);

        if (Option.isSome(cached) && cached.value.expiresAt_epochMs > now) {
            return cached.value.accessToken;
        }

        // single-flight refresh
        return yield* mutex.withPermits(1)(
            Effect.gen(function* () {
                const recheck = yield* Ref.get(ref)
                if (Option.isSome(recheck) && recheck.value.expiresAt_epochMs > Date.now()) {
                    return recheck.value.accessToken;
                }
                const getFresh = Effect.tapErrorTag(authenticate, "ParseError", (err) => Effect.gen(function* () {
                    yield* Effect.logError("parse error msg:", err.message);
                    yield* Effect.logError("actual:", err.issue.actual);
                }));

                yield* Effect.logWarning("Token expired or non-existant, retrieving new token...");
                const fresh = yield* getFresh;

                yield* Ref.set(ref, Option.some(fresh));
                return fresh.accessToken;
            })
        );
    });

    return { getValidToken }
});

export class ImanageService extends Effect.Service<ImanageService>()("ImanageService", {
    effect: Effect.gen(function* () {
        const conf = yield* ImanageConfig;

        const library: "LIVE" | "DEV" = Bun.env.NODE_ENV === "production"
            ? "LIVE"
            : "DEV";

        const helperPath = `${conf.baseURL.href}/work/api/v2/customers/1/libraries/${library}` as const;

        const tokenManager = yield* makeTokenManager;
        const getToken = tokenManager.getValidToken;

        const authedClient = (yield* HttpClient.HttpClient).pipe(
            HttpClient.mapRequestEffect((req) => Effect.gen(function* () {
                const token = yield* getToken;
                return HttpClientRequest.setHeader(req, "X-Auth-Token", token);
            })),
        );

        const uploadFile = (args: {
            folderID: string;
            file: ArrayBuffer;
            docProfile: typeof UploadDocumentRequestSchema.Encoded;
        }) => Effect.gen(function* () {
            const { docProfile, folderID, file } = args;
        
            const url = new URL(`${helperPath}/folders/${folderID}/documents`);
            
            const buff = new Uint8Array(file);
            const formData = new FormData();
            formData.append("profile", new Blob([JSON.stringify(docProfile)], { type: "application/json" }));
            formData.append("file", new Blob([buff]));
            const body = HttpBody.formData(formData);

            const response = yield* authedClient.post(url, {
                body,
            });

            return response;
        });

        return {
            library,
            helperPath,
            basePath: conf.baseURL,
            client: authedClient,
            uploadFile,
        }
    }).pipe(
        Effect.provide(FetchHttpClient.layer),
    )
}) { }