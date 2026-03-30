import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildAgsLaunchService,
  buildDeploymentBinding,
  buildMoodleDeploymentBinding,
  buildSakaiDeploymentBinding,
  getTestToolPrivateJwkEnvValue,
} from "../test_helpers/lti.ts";
import { restoreEnv, withFetchStub } from "../test_helpers/fetch_stub.ts";
import {
  ensureLineItem,
  publishFinalScore,
  requestServiceAccessToken,
} from "./services.ts";

Deno.test("LTI services client reuses a launch lineitem or creates one from the lineitems container before score publish", async () => {
  const ags = buildAgsLaunchService({}, "lineitems");
  let requestCount = 0;

  const result = await withFetchStub(
    (input, init) => {
      requestCount += 1;
      const url = String(input);
      const headers = new Headers(init?.headers);

      assertEquals(url, ags.lineitemsUrl);
      assertEquals(init?.method ?? "GET", "GET");
      assertEquals(
        (init?.headers as HeadersInit | undefined) !== undefined,
        true,
      );
      assertEquals(
        headers.get("user-agent"),
        "Lantern-LTI-Service/1.0",
      );
      assertEquals(
        headers.get("authorization"),
        "Bearer canvas-access-token",
      );

      return new Response(
        JSON.stringify([
          {
            id: "https://canvas.example/api/lti/courses/42/line_items/9",
            resourceLinkId: "resource-link-123",
            resourceId: "chapter-4-asteroids:0.1.0",
            tag: "final-grade",
            label: "Chapter 4 Asteroids Final Grade",
            scoreMaximum: 100,
          },
        ]),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
    async () =>
      await ensureLineItem({
        accessToken: "canvas-access-token",
        lineitemsUrl: ags.lineitemsUrl,
        resourceLinkId: "resource-link-123",
        resourceId: "chapter-4-asteroids:0.1.0",
        tag: "final-grade",
        label: "Chapter 4 Asteroids Final Grade",
        scoreMaximum: 100,
      }),
  );

  assertEquals(requestCount, 1);
  assertEquals(
    result.lineItemUrl,
    "https://canvas.example/api/lti/courses/42/line_items/9",
  );
  assertEquals(result.created, false);
});

Deno.test("LTI services client requests RS256 client-credentials tokens from the saved deployment binding", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
  const bindings = [
    buildDeploymentBinding(),
    buildMoodleDeploymentBinding(),
    buildSakaiDeploymentBinding(),
  ] as const;
  const requests: Array<{
    url: string;
    method: string;
    body: string;
    authorization: string | null;
  }> = [];

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    await withFetchStub(
      (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = typeof init?.body === "string"
          ? init.body
          : init?.body instanceof URLSearchParams
          ? init.body.toString()
          : "";
        const headers = new Headers(init?.headers);

        requests.push({
          url,
          method,
          body,
          authorization: headers.get("authorization"),
        });

        const matchingBinding = bindings.find((binding) => {
          switch (binding.lms) {
            case "canvas":
              return url === "https://sso.canvaslms.com/login/oauth2/token";
            case "moodle":
            case "sakai":
              return url === binding.accessTokenUrl;
            default:
              return false;
          }
        });

        if (matchingBinding !== undefined) {
          assertEquals(method, "POST");
          assertStringIncludes(body, "grant_type=client_credentials");
          assertStringIncludes(body, `client_id=${matchingBinding.clientId}`);
          assertStringIncludes(
            body,
            `deployment_id=${matchingBinding.deploymentId}`,
          );
          assertStringIncludes(
            body,
            "scope=https%3A%2F%2Fpurl.imsglobal.org%2Fspec%2Flti-ags%2Fscope%2Fscore",
          );
          assertStringIncludes(body, "client_assertion_type=");
          assertStringIncludes(body, "client_assertion=");

          return new Response(
            JSON.stringify({
              access_token: `${matchingBinding.lms}-access-token`,
              token_type: "bearer",
              expires_in: 300,
              scope: [
                "https://purl.imsglobal.org/spec/lti-ags/scope/score",
                "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
              ].join(" "),
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        throw new Error(`Unexpected request to ${url}.`);
      },
      async () => {
        for (const binding of bindings) {
          const token = await requestServiceAccessToken({
            binding,
            scopes: [
              "https://purl.imsglobal.org/spec/lti-ags/scope/score",
              "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
            ],
          });

          assertEquals(token.accessToken, `${binding.lms}-access-token`);
          assertEquals(token.expiresIn, 300);
        }
      },
    );
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }

  assertEquals(requests.length, 3);
});

Deno.test("LTI services client tolerates sparse line-item payloads and creates a fresh record instead of aborting grading flow", async () => {
  const ags = buildAgsLaunchService({}, "lineitems");
  const requests: string[] = [];

  const result = await withFetchStub(
    (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);

      requests.push(`${method} ${url}`);

      if (method === "GET") {
        assertEquals(headers.get("user-agent"), "Lantern-LTI-Service/1.0");
        return new Response(
          JSON.stringify([
            {
              id: "https://canvas.example/api/lti/courses/42/line_items/9",
              scoreMaximum: 100,
            },
          ]),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      assertEquals(method, "POST");
      assertEquals(headers.get("user-agent"), "Lantern-LTI-Service/1.0");

      return new Response(
        JSON.stringify({
          id: "https://canvas.example/api/lti/courses/42/line_items/11",
          label: "Chapter 4 Asteroids Final Grade",
          scoreMaximum: 100,
        }),
        {
          status: 201,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
    async () =>
      await ensureLineItem({
        accessToken: "canvas-access-token",
        lineitemsUrl: ags.lineitemsUrl,
        resourceLinkId: "resource-link-123",
        resourceId: "chapter-4-asteroids:0.1.0",
        tag: "final-grade",
        label: "Chapter 4 Asteroids Final Grade",
        scoreMaximum: 100,
      }),
  );

  assertEquals(requests, [
    `GET ${ags.lineitemsUrl}`,
    `POST ${ags.lineitemsUrl}`,
  ]);
  assertEquals(result.created, true);
  assertEquals(
    result.lineItemUrl,
    "https://canvas.example/api/lti/courses/42/line_items/11",
  );
});

Deno.test("LTI services client publishes final AGS scores with server-owned identity", async () => {
  const requests: Array<{
    url: string;
    method: string;
    body: string;
    authorization: string | null;
  }> = [];

  await withFetchStub(
    (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string"
        ? init.body
        : init?.body instanceof URLSearchParams
        ? init.body.toString()
        : "";
      const headers = new Headers(init?.headers);

      requests.push({
        url,
        method,
        body,
        authorization: headers.get("authorization"),
      });

      assertEquals(
        url,
        "https://canvas.example/api/lti/courses/42/line_items/9/scores",
      );
      assertEquals(method, "POST");
      assertEquals(headers.get("authorization"), "Bearer canvas-access-token");
      assertEquals(headers.get("user-agent"), "Lantern-LTI-Service/1.0");
      assertStringIncludes(body, '"userId":"canvas-user-123"');
      assertStringIncludes(body, '"scoreGiven":85');
      assertStringIncludes(body, '"scoreMaximum":100');

      return new Response(null, { status: 202 });
    },
    async () => {
      const publication = await publishFinalScore({
        accessToken: "canvas-access-token",
        lineItemUrl: "https://canvas.example/api/lti/courses/42/line_items/9",
        platformUserId: "canvas-user-123",
        scoreGiven: 85,
        scoreMaximum: 100,
        activityProgress: "Completed",
        gradingProgress: "FullyGraded",
        timestamp: "2026-03-24T03:00:00Z",
      });

      assertEquals(publication.accepted, true);
      assertEquals(publication.status, 202);
    },
  );

  assertEquals(requests.length, 1);
});

Deno.test("LTI services client retries one Canvas score publish with a fresh token after a 401", async () => {
  const tokens: string[] = [];
  let refreshCount = 0;

  const publication = await withFetchStub(
    (_input, init) => {
      const headers = new Headers(init?.headers);
      const authorization = headers.get("authorization");

      tokens.push(authorization ?? "");
      assertEquals(headers.get("user-agent"), "Lantern-LTI-Service/1.0");

      if (authorization === "Bearer canvas-access-token") {
        return new Response(null, { status: 401 });
      }

      return new Response(null, { status: 202 });
    },
    async () =>
      await publishFinalScore({
        accessToken: "canvas-access-token",
        retryUnauthorized: () => {
          refreshCount += 1;

          return Promise.resolve("canvas-access-token-refreshed");
        },
        lineItemUrl: "https://canvas.example/api/lti/courses/42/line_items/9",
        platformUserId: "canvas-user-123",
        scoreGiven: 85,
        scoreMaximum: 100,
        activityProgress: "Completed",
        gradingProgress: "FullyGraded",
        timestamp: "2026-03-24T03:00:00Z",
      }),
  );

  assertEquals(refreshCount, 1);
  assertEquals(tokens, [
    "Bearer canvas-access-token",
    "Bearer canvas-access-token-refreshed",
  ]);
  assertEquals(publication.status, 202);
});
