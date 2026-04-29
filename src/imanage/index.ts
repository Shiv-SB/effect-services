import { FetchHttpClient, HttpBody, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { OauthResposneSchema, UploadDocumentRequestSchema } from "./schema";
import { unravel } from "../internals/helpers";
import { Context, Effect, Layer, Option, Redacted, Ref, Semaphore } from "effect";

type OAuthToken = {
    accessToken: string;
    refreshToken: string | null;
    expiresAt_epochMs: number;
}

interface ImanageConfigOpts {
    readonly username: string;
    readonly password: string | Redacted.Redacted<string>;
    readonly client_id: string;
    readonly client_secret: string | Redacted.Redacted<string>;
    readonly baseURL: URL;
    library: "LIVE" | "DEV" | (string & {});
}

export class ImanageConfig extends Context.Service<ImanageConfig, ImanageConfigOpts>()("effect-services/imanage/index/ImanageConfig"){}

const ImanageConfigLayer = (opts: ImanageConfigOpts) => Layer.succeed(ImanageConfig, opts);

const authenticate = Effect.gen(function* () {
    const conf = yield* ImanageConfig;

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
        HttpClientRequest.prependUrl(conf.baseURL.href),
        HttpClientRequest.bodyFormDataRecord(payload),
    );

    const response = yield* unauthedClient.execute(request);
    const body = yield* HttpClientResponse.schemaBodyJson(OauthResposneSchema, { onExcessProperty: "ignore" })(response);

    const token: OAuthToken = {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        // subtract a little skew to be safe
        expiresAt_epochMs: Date.now() + (body.expires_in - 30) * 1000
    };

    return token;
});

const makeTokenManager = Effect.gen(function* () {
    const ref = yield* Ref.make<Option.Option<OAuthToken>>(Option.none());
    const mutex = yield* Semaphore.make(1);

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
                const getFresh = Effect.tapErrorTag(authenticate, "SchemaError", (err) => Effect.gen(function* () {
                    yield* Effect.logError("parse error msg:", err.message);
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

export class ImanageService extends Context.Service<ImanageService>()("effect-services/imanage/index/ImanageService", {
    make: Effect.gen(function* () {
        const config = yield* ImanageConfig;

        const helperPath = `/work/api/v2/customers/1/libraries/${config.library}` as const;

        const tokenManager = yield* makeTokenManager;
        const getToken = tokenManager.getValidToken;

        const authedClient = (yield* HttpClient.HttpClient).pipe(
            HttpClient.mapRequestEffect((req) => Effect.gen(function* () {
                const token = yield* getToken;
                return HttpClientRequest.setHeader(req, "X-Auth-Token", token);
            }))
        );


        const uploadFile = (args: {
            folderID: string;
            file: Buffer;
            docProfile: typeof UploadDocumentRequestSchema.Encoded;
        }) => Effect.gen(function* () {
            const { docProfile, folderID, file } = args;
        
            const url = new URL(`${helperPath}/folders/${folderID}/documents`);
            
            const formData = new FormData();
            formData.append("profile", new Blob([JSON.stringify(docProfile)], { type: "application/json" }));
            formData.append("file", new Blob([file]));
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
