import { FetchHttpClient, HttpBody, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { OauthResponseSchema, UploadDocumentRequestSchema } from "./schema";
import { NowInMs, unravel, type RedactedOr } from "../internals/helpers";
import { Context, Effect, Layer, Option, Ref, Semaphore } from "effect";

export * as schemas from "./schema";

type OAuthToken = {
    accessToken: string;
    refreshToken: string | null;
    expiresAt_epochMs: number;
}

interface ImanageConfigOpts {
    readonly username: string;
    readonly password: RedactedOr;
    readonly client_id: string;
    readonly client_secret: RedactedOr;
    readonly baseURL: URL | string;
    library: "LIVE" | "DEV" | (string & {});
}

export class ImanageConfig extends Context.Service<ImanageConfig, ImanageConfigOpts>()("effect-services/imanage/index/ImanageConfig") { }

const ImanageConfigLayer = (opts: ImanageConfigOpts) => Layer.succeed(ImanageConfig, opts);

const authenticate = Effect.gen(function* () {
    const conf = yield* ImanageConfig;

    const refreshSkewMs = 3_000;

    const payload = {
        grant_type: "password",
        username: conf.username,
        password: unravel(conf.password),
        client_id: conf.client_id,
        client_secret: unravel(conf.client_secret),
    }

    const unauthedClient = (yield* HttpClient.HttpClient);

    const url = new URL("/auth/oauth2/token", conf.baseURL);

    const request = HttpClientRequest.post(url).pipe(
        HttpClientRequest.setHeader("Content-Type", "application/x-www-form-urlencoded"),
        //HttpClientRequest.prependUrl(typeof conf.baseURL === "string" ? new URL(conf.baseURL).href :  conf.baseURL.href),
        HttpClientRequest.bodyFormDataRecord(payload),
    );

    const response = yield* unauthedClient.execute(request);
    const body = yield* HttpClientResponse.schemaBodyJson(OauthResponseSchema, { onExcessProperty: "ignore" })(response);

    const now = yield* NowInMs;

    const token: OAuthToken = {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        // subtract a little skew to be safe
        expiresAt_epochMs: now + (body.expires_in - refreshSkewMs) * 1000
    };

    return token;
});

const makeTokenManager = Effect.gen(function* () {
    const ref = yield* Ref.make<Option.Option<OAuthToken>>(Option.none());
    const mutex = yield* Semaphore.make(1);

    const getValidToken = Effect.gen(function* () {
        const now = yield* NowInMs;
        const cached = yield* Ref.get(ref);

        if (Option.isSome(cached) && cached.value.expiresAt_epochMs > now) {
            return cached.value.accessToken;
        }

        // single-flight refresh
        return yield* mutex.withPermits(1)(
            Effect.gen(function* () {
                const recheck = yield* Ref.get(ref);
                const now = yield* NowInMs;

                if (Option.isSome(recheck) && recheck.value.expiresAt_epochMs > now) {
                    return recheck.value.accessToken;
                }

                const getFresh = Effect.tapErrorTag(
                    authenticate,
                    "SchemaError",
                    (err) => Effect.logError("parse error msg:", err.message)
                );

                yield* Effect.logWarning("Token expired or non-existant, retrieving new token...");
                const fresh = yield* getFresh;

                yield* Ref.set(ref, Option.some(fresh));
                return fresh.accessToken;
            })
        );
    });

    return { getValidToken }
});

interface UploadFileOpts {
    folderID: string;
    file: Buffer | Blob;
    docProfile: typeof UploadDocumentRequestSchema.Encoded;
}

export class ImanageService extends Context.Service<ImanageService>()("effect-services/imanage/index/ImanageService", {
    make: Effect.gen(function* () {
        const config = yield* ImanageConfig;

        const helperPath = `/work/api/v2/customers/1/libraries/${config.library}` as const;

        const tokenManager = yield* makeTokenManager;
        
        const authedClient = (yield* HttpClient.HttpClient).pipe(
            HttpClient.mapRequestEffect(Effect.fn(function* (req) {
                const token = yield* tokenManager.getValidToken;
                return HttpClientRequest.setHeader(req, "X-Auth-Token", token);
            }))
        );

        const uploadFile = Effect.fn("ImanageService.uploadFile")(function* (args: UploadFileOpts) {
            const { docProfile, folderID, file } = args;

            const url = new URL(`${helperPath}/folders/${folderID}/documents`);

            const formData = new FormData();
            formData.append("profile", new Blob([JSON.stringify(docProfile)], { type: "application/json" }));
            formData.append("file", file instanceof Blob ? file : new Blob([file]));
            const body = HttpBody.formData(formData);

            const response = yield* authedClient.post(url, {
                body,
            });

            return response;
        });

        return {
            helperPath,
            client: authedClient,
            uploadFile
        }
    })
}) {
    static readonly layer = (opts: ImanageConfigOpts) => Layer.effect(this, this.make).pipe(
        Layer.provide(FetchHttpClient.layer),
        Layer.provide(ImanageConfigLayer(opts))
    )
}
