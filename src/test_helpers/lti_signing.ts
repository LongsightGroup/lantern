import { importJWK, SignJWT } from 'jose';
import type { DeploymentBinding } from '../lti/types.ts';
import { LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE as DEFAULT_DEEP_LINKING_REQUEST_MESSAGE_TYPE } from '../lti/types.ts';
import {
  type AgsShape,
  buildAgsLaunchClaimValue,
  buildDeploymentBinding,
  buildNrpsLaunchClaimValue,
  TEST_NOW,
} from './lti_identity_builders.ts';
import { buildDeepLinkingSettingsClaimValue } from './lti_session_builders.ts';

export const TEST_TOOL_PRIVATE_JWK = {
  kty: 'RSA',
  alg: 'RS256',
  n: 'uqAz51P9MxAXrvGI_6QMTdFQhpUqjLtialtYuIvFkJaB98npMnFuBMfMpXH0vTEWlyTWNencpsco4t0X4PBVEk7n3kol3JvRSGqNSotQ0lx4omi9qeCNljAWiSc6FyEn-FfWOxwKwQZxhbgBclBxsVQqrHAtcADA2pUzG9HzZaPmNLHyZ7zzr3D8PNIEM2qmqhUp9cm1UTZu8iJg6B7X-Jcazpa5N_nbkYIwAjyE6iep4IP4HoRIxOSoewdmxyEhtii7a-wz6bGVICht0cOegTe1mmZIo7xQHvz0I4v0y2xkhfCBCOEI8HeGWiGU95_KazbNdC_qZyIsGDqLndTigw',
  e: 'AQAB',
  d: 'G38vJo5BaBye4K_Ft6S8C1sjujCQLFwPjAwZbldprHwAejnNmhkMVLf7dwTrQlTRN0O-LANg91GwvHxG4GWIo0Hs99uE6JQsqbbJSopsRhJJ0-QKzdTAB7jeGScmb_H6qaSHc_4Vt4rzfvg1flpL5gy4nN-KUk5KG-qPtTGh4v-aqkfzkxVnEBb-VfB_o5nafMimKp1TMXSPcL-4NjjwFioP8YcQDYxwKJGHHm7_CqSfCu5AMx7UByVxsVFNTsaua0lFUQDaVR13eHFFOdUZiAUe97Ua_JYec6Gxe4-3g1bCmGbGm9U_35fGM5kt4NXWND0ULgJfI8alAUDjxblQQQ',
  p: '2WhfV1qBXbQwL5tW6GaD-nKaZYfGoOOgyKQKjtV7UIBWXECOiciIHxUMoSQrmtbtNLg64K58FLBZ11loOyoso1351MfsQB6FzZfF_zkHlfcNKuWLphwTizTv61TC4_r-5lsoQ5CI34UzzSZaY50AjHg2n6_ahUbTqsYyCmG9Rzc',
  q: '28EDIGEyaKjMnMdD0NJgQSTxrMzwQujRpioPGWRD6y3ADVwA7p-u4XhiekuOwRjbmyJrJ_HcUna0J0ZydFwo9KRVfIhDhcUGioEnUatWWaMEZDBl6RzyEutR1H4oNx9fjJykNcP13O-fMgHzsZ5k8Oc_lZy1wyJGNnQGQChxzRU',
  dp: 'r3QWDY9S--ZhROpeduvU8xfuFqY-3LUXmxUYGDGddVg9WfIXloappDv-l0Vzk2CEypkrmwv1w1SXDL5w6d6da7J53wkBVrXLUiJ8ff7uak6Y59ecng_mjd_JB-i95_M2J33FvtE0RP9g0N108RNR0AtsOe9XsVt5k0akN9CtSn0',
  dq: '2KD7kQbf53ZHRmHUw10vz-g4aa0ZSAw054Xcnp5Nqd_OzByfOpyli9Td10r2rfnwOo0Cbz0ogQ5NZ841c-mJ4ijBsOKvFYZ1fUH2Xbb2h6SA5rcjL1r-c5IQd9XplPVTfszHv8yuaR66o1RzQ-wt-6Eq-DSkpXj7GCDmLIbyMEU',
  qi: 'X9i7s0LnslcujfZlwBXIbpEU6lz7P11_DPID3j24OhzSTXCadpL7tLLOGG3LuHKx4-izFsVVcrCJ4xnYAG7rwvOVrGm-DTyPrA7AmopnZJ9xxJC2NmDbQc-xVykeSdgUGRl7YkitHdfsmUn6Biy738ihxbGYaZMDd3fRW9hssio',
  use: 'sig',
} as const;

export const TEST_CANVAS_PRIVATE_JWK = {
  kty: 'EC',
  crv: 'P-256',
  x: 'Fgb7eS3YhjqEBd7cgS6DsI6-03QFxuRwQsYgg-ouGcw',
  y: '5Oz3PTCdqSCgyjivrUo7O-OU3Pke-c4F0wsTDHthhdk',
  d: 'sANZQwLQiOe9yhkHkeU6LugbEM_GZdNgx6dFIKEOsdk',
  kid: 'canvas-test-key',
  alg: 'ES256',
  use: 'sig',
} as const;

export interface CanvasLaunchTokenInput {
  deploymentBinding?: Partial<DeploymentBinding>;
  audience?: string;
  nonce?: string;
  subject?: string | null;
  messageType?: string;
  version?: string;
  issuedAt?: string;
  expirationTime?: string;
  targetLinkUri?: string;
  resourceLinkId?: string;
  resourceLinkTitle?: string;
  contextId?: string;
  contextTitle?: string;
  roles?: string[];
  returnUrl?: string;
  ags?: {
    scope?: string[];
    lineitemsUrl?: string | null;
    lineitemUrl?: string | null;
  } | null;
  agsShape?: AgsShape;
  nrps?: {
    contextMembershipsUrl?: string;
    serviceVersions?: string[];
  } | null;
  deepLinkReturnUrl?: string;
  deepLinkData?: string | null;
  deepLinkAcceptTypes?: string[];
  deepLinkAcceptMultiple?: boolean;
  deepLinkAcceptPresentationDocumentTargets?: string[];
  deepLinkAcceptLineItem?: boolean;
  custom?: Record<string, string>;
}

export interface ToolClientAssertionInput {
  issuer?: string;
  subject?: string;
  audience?: string;
  issuedAt?: string;
  expirationTime?: string;
  jwtId?: string;
}

export async function signCanvasIdToken(input: CanvasLaunchTokenInput = {}): Promise<string> {
  const binding = buildDeploymentBinding(input.deploymentBinding ?? {});
  const agsClaim =
    input.ags === null ? null : buildAgsLaunchClaimValue(input.ags ?? {}, input.agsShape);
  const nrpsClaim = input.nrps === null ? null : buildNrpsLaunchClaimValue(input.nrps ?? {});
  const deepLinkingSettings =
    input.messageType === DEFAULT_DEEP_LINKING_REQUEST_MESSAGE_TYPE ||
    input.deepLinkReturnUrl !== undefined ||
    input.deepLinkAcceptTypes !== undefined ||
    input.deepLinkAcceptPresentationDocumentTargets !== undefined
      ? buildDeepLinkingSettingsClaimValue({
          acceptTypes: input.deepLinkAcceptTypes,
          acceptMultiple: input.deepLinkAcceptMultiple,
          acceptPresentationDocumentTargets: input.deepLinkAcceptPresentationDocumentTargets,
          acceptLineItem: input.deepLinkAcceptLineItem,
          deepLinkReturnUrl: input.deepLinkReturnUrl,
          data: input.deepLinkData,
        })
      : null;
  const claims = {
    nonce: input.nonce ?? 'nonce-123',
    'https://purl.imsglobal.org/spec/lti/claim/message_type':
      input.messageType ?? 'LtiResourceLinkRequest',
    'https://purl.imsglobal.org/spec/lti/claim/version': input.version ?? '1.3.0',
    'https://purl.imsglobal.org/spec/lti/claim/deployment_id': binding.deploymentId,
    'https://purl.imsglobal.org/spec/lti/claim/target_link_uri':
      input.targetLinkUri ?? 'http://localhost:8000/lti/launch',
    'https://purl.imsglobal.org/spec/lti/claim/resource_link': {
      id: input.resourceLinkId ?? 'resource-link-123',
      title: input.resourceLinkTitle ?? 'Chapter 4 Asteroids',
    },
    'https://purl.imsglobal.org/spec/lti/claim/context': {
      id: input.contextId ?? 'course-42',
      title: input.contextTitle ?? 'Physics 101',
    },
    'https://purl.imsglobal.org/spec/lti/claim/launch_presentation': {
      document_target: 'iframe',
      return_url: input.returnUrl ?? 'https://canvas.example/return',
    },
    'https://purl.imsglobal.org/spec/lti/claim/roles': input.roles ?? [
      'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
    ],
    ...(input.custom === undefined
      ? {}
      : {
          'https://purl.imsglobal.org/spec/lti/claim/custom': input.custom,
        }),
    ...(agsClaim === null
      ? {}
      : {
          'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': agsClaim,
        }),
    ...(nrpsClaim === null
      ? {}
      : {
          'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice': nrpsClaim,
        }),
    ...(deepLinkingSettings === null
      ? {}
      : {
          'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings': deepLinkingSettings,
        }),
  };
  const signingKey = await importJWK(TEST_CANVAS_PRIVATE_JWK, 'ES256');
  let token = new SignJWT(claims)
    .setProtectedHeader({
      alg: 'ES256',
      kid: TEST_CANVAS_PRIVATE_JWK.kid,
      typ: 'JWT',
    })
    .setIssuer(binding.issuer)
    .setAudience(input.audience ?? binding.clientId)
    .setIssuedAt(Math.floor(Date.parse(input.issuedAt ?? TEST_NOW) / 1000))
    .setExpirationTime(input.expirationTime ?? '5m')
    .setJti('launch-jti-123');

  if (input.subject !== null) {
    token = token.setSubject(input.subject ?? 'canvas-user-123');
  }

  return await token.sign(signingKey);
}

export function getTestCanvasJwks(): {
  keys: [
    {
      kty: string;
      crv: string;
      x: string;
      y: string;
      kid: string;
      alg: string;
      use: string;
    },
  ];
} {
  return {
    keys: [
      {
        kty: TEST_CANVAS_PRIVATE_JWK.kty,
        crv: TEST_CANVAS_PRIVATE_JWK.crv,
        x: TEST_CANVAS_PRIVATE_JWK.x,
        y: TEST_CANVAS_PRIVATE_JWK.y,
        kid: TEST_CANVAS_PRIVATE_JWK.kid,
        alg: TEST_CANVAS_PRIVATE_JWK.alg,
        use: TEST_CANVAS_PRIVATE_JWK.use,
      },
    ],
  };
}

export function getTestToolPrivateJwkEnvValue(): string {
  return JSON.stringify(TEST_TOOL_PRIVATE_JWK);
}

export function buildToolClientAssertionClaims(input: ToolClientAssertionInput = {}): {
  iss: string;
  sub: string;
  aud: string;
  jti: string;
} {
  const issuer = input.issuer ?? '10000000000001';
  const subject = input.subject ?? issuer;

  return {
    iss: issuer,
    sub: subject,
    aud: input.audience ?? 'https://canvas.example/login/oauth2/token',
    jti: input.jwtId ?? 'tool-client-assertion-123',
  };
}

export async function signToolClientAssertion(
  input: ToolClientAssertionInput = {},
): Promise<string> {
  const claims = buildToolClientAssertionClaims(input);
  const signingKey = await importJWK(TEST_TOOL_PRIVATE_JWK, 'RS256');

  return await new SignJWT({})
    .setProtectedHeader({
      alg: 'RS256',
      typ: 'JWT',
    })
    .setIssuer(claims.iss)
    .setSubject(claims.sub)
    .setAudience(claims.aud)
    .setJti(claims.jti)
    .setIssuedAt(Math.floor(Date.parse(input.issuedAt ?? TEST_NOW) / 1000))
    .setExpirationTime(input.expirationTime ?? '5m')
    .sign(signingKey);
}
