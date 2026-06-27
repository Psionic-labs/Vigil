/**
 * @file token-encryption.ts
 * @description Encrypts and decrypts GitHub OAuth tokens using AES-256-GCM.
 * @why Secures sensitive third-party tokens at rest with versioned keys to allow rotation.
 */
import crypto from "crypto";

export interface EncryptedToken {
  ciphertext: string; // base64
  iv: string;         // base64
  tag: string;        // base64
  version: number;    // key version for future rotation support
}

const CURRENT_VERSION = 1;

/**
 * Returns the derived 32-byte encryption key from environment variable.
 * Throws if the environment variable is not set.
 */
export function getEncryptionKeyOrThrow(): Buffer {
  const rawKey = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY is required for @vigil/api");
  }
  // Hash the raw key with SHA-256 to guarantee a robust 32-byte key for AES-256-GCM.
  return crypto.createHash("sha256").update(rawKey).digest();
}

/**
 * Encrypts a plaintext token into a JSON string representing EncryptedToken.
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKeyOrThrow();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let ciphertext = cipher.update(plaintext, "utf8", "base64");
  ciphertext += cipher.final("base64");
  const tag = cipher.getAuthTag().toString("base64");

  const tokenObj: EncryptedToken = {
    ciphertext,
    iv: iv.toString("base64"),
    tag,
    version: CURRENT_VERSION,
  };

  return JSON.stringify(tokenObj);
}

/**
 * Decrypts an encrypted token JSON string back to plaintext.
 */
export function decryptToken(encryptedJson: string): string {
  const tokenObj: EncryptedToken = JSON.parse(encryptedJson);
  const key = getEncryptionKeyOrThrow();

  if (tokenObj.version !== CURRENT_VERSION) {
    throw new Error(`Unsupported token encryption version: ${tokenObj.version}`);
  }

  const iv = Buffer.from(tokenObj.iv, "base64");
  const tag = Buffer.from(tokenObj.tag, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  let plaintext = decipher.update(tokenObj.ciphertext, "base64", "utf8");
  plaintext += decipher.final("utf8");

  return plaintext;
}
