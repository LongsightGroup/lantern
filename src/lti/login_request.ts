export interface LoginRequest {
  iss: string;
  loginHint: string;
  targetLinkUri: string | null;
  clientId: string | null;
  deploymentId: string;
  ltiMessageHint: string | null;
}

export interface LoginRequestCompatibility {
  decodedLoginHint: string | null;
  decodedLtiMessageHint: string | null;
}
