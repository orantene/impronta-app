import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKeyBytes(): Buffer {
  const raw = process.env.AI_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("AI_CREDENTIALS_ENCRYPTION_KEY is not configured.");
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("AI_CREDENTIALS_ENCRYPTION_KEY must be base64 for exactly 32 bytes.");
  }
  return buf;
}

export function isCredentialEncryptionConfigured(): boolean {
  const raw = process.env.AI_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!raw) return false;
  return Buffer.from(raw, "base64").length === 32;
}

/**
 * Encrypt a UTF-8 secret for storage in `ai_provider_secrets.ciphertext` (base64 blob).
 */
export function encryptSecret(plain: string): string {
  const key = getKeyBytes();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payloadB64: string): string | null {
  try {
    const key = getKeyBytes();
    const buf = Buffer.from(payloadB64, "base64");
    if (buf.length < IV_LEN + TAG_LEN + 1) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function maskApiKey(secret: string): string {
  const t = secret.trim();
  if (t.length <= 4) return "••••";
  return `••••${t.slice(-4)}`;
}
