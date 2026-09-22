import { WebAuthnMode, toWebAuthnKey } from "@zerodev/passkey-validator";

/**
 * Registers a new WebAuthn passkey using the device's Secure Enclave / Windows Hello.
 * 
 * @param username The name to associate with the passkey credentials.
 * @returns The WebAuthn key instance containing the generated P-256 public key.
 */
export async function registerPasskey(username: string) {
  // Prompts the user's OS to create a new passkey.
  // The P-256 keypair is generated securely in the device's enclave.
  const webAuthnKey = await toWebAuthnKey({
    passkeyName: username,
    passkeyServerUrl: (import.meta.env.VITE_PASSKEY_SERVER_URL as string) || "http://localhost:8000",
    mode: WebAuthnMode.Register,
  });

  return webAuthnKey;
}

/**
 * Prompts the user to authenticate using an existing passkey (e.g., via FaceID/TouchID).
 * 
 * @param username The name of the passkey to authenticate against.
 * @returns The WebAuthn key instance initialized for signing UserOperations.
 */
export async function loginPasskey(username: string) {
  // Prompts the biometric authentication flow to unlock the P-256 private key for signing.
  const webAuthnKey = await toWebAuthnKey({
    passkeyName: username,
    passkeyServerUrl: (import.meta.env.VITE_PASSKEY_SERVER_URL as string) || "http://localhost:8000",
    mode: WebAuthnMode.Login,
  });

  return webAuthnKey;
}

/**
 * Note on `signUserOp`:
 * In modern AA SDKs (like ZeroDev/permissionless.js), you typically don't call
 * `signUserOp` manually. Instead, the WebAuthn key instance is passed into the
 * Smart Account Validator (see accountManager.ts), which automatically intercepts
 * UserOperation signing requests and triggers the biometric prompt to generate
 * the assertion signature.
 */
