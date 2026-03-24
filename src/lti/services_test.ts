import { assertEquals } from "@std/assert";
import {
  buildAgsLaunchService,
  buildNrpsLaunchService,
  signToolClientAssertion,
} from "../test_helpers/lti.ts";

Deno.test.ignore(
  "LTI services client reuses a launch lineitem or creates one from the lineitems container before score publish",
  async () => {
    const modulePath = `./${"services.ts"}`;
    const services = await import(modulePath);
    const ags = buildAgsLaunchService({}, "lineitems");

    const result = await services.ensureLineItem({
      accessToken: "canvas-access-token",
      lineitemsUrl: ags.lineitemsUrl,
      resourceLinkId: "resource-link-123",
      resourceId: "chapter-4-asteroids:0.1.0",
      tag: "final-grade",
      label: "Chapter 4 Asteroids Final Grade",
      scoreMaximum: 100,
    });

    assertEquals(
      result.lineItemUrl,
      "https://canvas.example/api/lti/courses/42/line_items/9",
    );
  },
);

Deno.test.ignore(
  "LTI services client requests RS256 client-credentials tokens and publishes final AGS scores with server-owned identity",
  async () => {
    const modulePath = `./${"services.ts"}`;
    const services = await import(modulePath);
    const assertion = await signToolClientAssertion();

    const publication = await services.publishFinalScore({
      tokenEndpoint: "https://canvas.example/login/oauth2/token",
      clientAssertion: assertion,
      scopes: [
        "https://purl.imsglobal.org/spec/lti-ags/scope/score",
        "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
      ],
      lineItemUrl: "https://canvas.example/api/lti/courses/42/line_items/9",
      canvasUserId: "canvas-user-123",
      scoreGiven: 85,
      scoreMaximum: 100,
      activityProgress: "Completed",
      gradingProgress: "FullyGraded",
    });

    assertEquals(publication.accepted, true);
  },
);

Deno.test.ignore(
  "LTI services client reads paginated NRPS memberships from the launch-scoped context_memberships_url",
  async () => {
    const modulePath = `./${"services.ts"}`;
    const services = await import(modulePath);
    const nrps = buildNrpsLaunchService();

    const members = await services.readContextMemberships({
      accessToken: "canvas-access-token",
      contextMembershipsUrl: nrps.contextMembershipsUrl,
    });

    assertEquals(Array.isArray(members), true);
  },
);
