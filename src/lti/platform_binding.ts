import { resolveCanvasPlatform } from "./canvas_platform.ts";
import { resolveCanvasTokenEndpoint } from "./service_support.ts";
import type { DeploymentBinding, LmsType } from "./types.ts";

export function resolveAuthorizationEndpoint(
  binding: DeploymentBinding,
): string {
  switch (binding.lms) {
    case "canvas":
      return resolveCanvasPlatform(binding.issuer).authorizationEndpoint;
    case "moodle":
      return binding.authenticationRequestUrl;
    case "sakai":
      return binding.oidcAuthenticationUrl;
  }
}

export function resolveBindingJwksUrl(binding: DeploymentBinding): string {
  switch (binding.lms) {
    case "canvas":
      return resolveCanvasPlatform(binding.issuer).jwksUrl;
    case "moodle":
    case "sakai":
      return binding.jwksUrl;
  }
}

export function resolveServiceTokenEndpoint(
  binding: DeploymentBinding,
): string {
  switch (binding.lms) {
    case "canvas":
      return resolveCanvasTokenEndpoint(
        resolveCanvasPlatform(binding.issuer).authorizationEndpoint,
      );
    case "moodle":
    case "sakai":
      return binding.accessTokenUrl;
  }
}

export function formatLmsLabel(lms: LmsType): string {
  switch (lms) {
    case "canvas":
      return "Canvas";
    case "moodle":
      return "Moodle";
    case "sakai":
      return "Sakai";
  }
}
