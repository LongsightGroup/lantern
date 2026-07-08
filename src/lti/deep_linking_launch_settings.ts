import { decodeJwt } from 'jose';

const CLAIM_DEEP_LINKING_SETTINGS =
  'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings';

export type DeepLinkingAcceptLineItemClaim =
  | {
    success: true;
    value: boolean;
  }
  | {
    success: false;
    message: string;
  };

export async function readLaunchIdToken(request: Request): Promise<string | null> {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return null;
  }

  const idToken = formData.get('id_token');

  return typeof idToken === 'string' && idToken.trim() !== '' ? idToken : null;
}

export function readVerifiedDeepLinkingAcceptLineItemClaim(
  idToken: string | null,
): DeepLinkingAcceptLineItemClaim {
  if (idToken === null) {
    return { success: true, value: false };
  }

  try {
    return readDeepLinkingAcceptLineItemFromPayload(decodeJwt(idToken));
  } catch {
    return {
      success: false,
      message: 'Verified Deep Linking id_token could not be decoded.',
    };
  }
}

function readDeepLinkingAcceptLineItemFromPayload(
  payload: Record<string, unknown>,
): DeepLinkingAcceptLineItemClaim {
  const settings = payload[CLAIM_DEEP_LINKING_SETTINGS];

  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    return { success: true, value: false };
  }

  // SAFETY: The object/null/array guard above narrows the JWT claim to a record-like shape;
  // this only reads one optional extension field not exposed by lti-tool@0.1.3.
  const acceptLineItem = (settings as Record<string, unknown>).accept_lineitem;

  if (acceptLineItem === undefined) {
    return { success: true, value: false };
  }

  if (typeof acceptLineItem !== 'boolean') {
    return {
      success: false,
      message: 'Deep Linking accept_lineitem must be a boolean when provided.',
    };
  }

  return { success: true, value: acceptLineItem };
}
