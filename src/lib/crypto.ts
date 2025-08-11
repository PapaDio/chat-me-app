import crypto from 'crypto'

// Key derivation: derive a 32-byte key from MSG_ENC_KEY using scrypt
function getKey(): Buffer {
  const secret = process.env.MSG_ENC_KEY || 'dev-insecure-message-key'
  // Use a fixed salt string for deterministic key; replace with secure salt mgmt in production
  return crypto.scryptSync(secret, 'msg_enc_salt_v1', 32)
}

// Encrypts text using AES-256-GCM and returns a compact string "enc:<iv_b64>:<ciphertext_b64>:<tag_b64>"
export function encryptText(plain: string): string {
  try {
    const iv = crypto.randomBytes(12)
    const key = getKey()
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const enc = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()])
    const tag = cipher.getAuthTag()
    return `enc:${iv.toString('base64')}:${enc.toString('base64')}:${tag.toString('base64')}`
  } catch {}
  // On failure, fall back to plaintext storage (not ideal, but avoids hard failures in dev)
  return plain
}

export function isEncrypted(text: string | null | undefined): boolean {
  return !!text && typeof text === 'string' && text.startsWith('enc:')
}

export function decryptText(text: string): string {
  try {
    if (!isEncrypted(text)) return text
    const parts = text.split(':')
    if (parts.length !== 4) return text
    const [, ivB64, dataB64, tagB64] = parts
    const iv = Buffer.from(ivB64, 'base64')
    const key = getKey()
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    const tag = Buffer.from(tagB64, 'base64')
    decipher.setAuthTag(tag)
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ])
    return dec.toString('utf8')
  } catch {}
  // If decryption fails, return original blob to avoid data loss in UI
  return text
}
