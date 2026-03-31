import { assertEquals } from "@std/assert";
import {
  DEFAULT_LTI_PROFILE_ID,
  LTI_CERTIFICATION_PROFILE_ID,
  LTI_GOVERNED_COMPATIBILITY_PROFILE_ID,
} from "../lti/profile.ts";
import { resolveCanvasIssuer } from "../lti/config.ts";
import { withRepositoryTestDatabase } from "./repository_test_support.ts";

Deno.test("repository returns the governed compatibility profile by default", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const settings = await repository.getLanternLtiProfileSettings();

    assertEquals(settings.defaultLtiProfile, DEFAULT_LTI_PROFILE_ID);
    assertEquals(typeof settings.updatedAt, "string");
  });
});

Deno.test("repository saves the Lantern-wide default LTI profile", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const saved = await repository.saveLanternDefaultLtiProfile({
      defaultLtiProfile: LTI_CERTIFICATION_PROFILE_ID,
    });

    assertEquals(saved.defaultLtiProfile, LTI_CERTIFICATION_PROFILE_ID);

    const loaded = await repository.getLanternLtiProfileSettings();

    assertEquals(loaded.defaultLtiProfile, LTI_CERTIFICATION_PROFILE_ID);
  });
});

Deno.test("repository saves and clears a deployment LTI profile override without changing the Lantern default", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    await repository.saveLanternDefaultLtiProfile({
      defaultLtiProfile: LTI_GOVERNED_COMPATIBILITY_PROFILE_ID,
    });

    const deployment = await repository.saveDeploymentBinding({
      slug: "chapter-4-asteroids-canvas",
      label: "Chapter 4 Asteroids Canvas",
      appId: "chapter-4-asteroids",
      binding: {
        lms: "canvas",
        canvasEnvironment: "production",
        issuer: resolveCanvasIssuer("production"),
        clientId: "canvas-client-123",
        deploymentId: "canvas-deployment-123",
      },
    });

    const overridden = await repository.saveDeploymentLtiProfileOverride({
      deploymentId: deployment.id,
      ltiProfileOverride: LTI_CERTIFICATION_PROFILE_ID,
    });

    assertEquals(overridden.ltiProfileOverride, LTI_CERTIFICATION_PROFILE_ID);

    const listed = await repository.listDeploymentsByApp("chapter-4-asteroids");

    assertEquals(
      listed.find((candidate) => candidate.id === deployment.id)
        ?.ltiProfileOverride,
      LTI_CERTIFICATION_PROFILE_ID,
    );
    assertEquals(
      (await repository.getLanternLtiProfileSettings()).defaultLtiProfile,
      LTI_GOVERNED_COMPATIBILITY_PROFILE_ID,
    );

    const cleared = await repository.saveDeploymentLtiProfileOverride({
      deploymentId: deployment.id,
      ltiProfileOverride: null,
    });

    assertEquals(cleared.ltiProfileOverride, null);
  });
});
