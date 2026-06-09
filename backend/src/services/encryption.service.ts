import crypto from 'crypto';
import { config } from '../config';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

// Parse and validate key length at boot time
const keyHex = config.encryption.key;
if (!keyHex || keyHex.length !== 64) {
  logger.error('[EncryptionService] Critical Configuration Error: ENCRYPTION_KEY must be a 64-character (32-byte) hex string');
  throw new Error('Encryption key must be a 64-character (32-byte) hex string');
}

const KEY = Buffer.from(keyHex, 'hex');

export class EncryptionService {
  // Encrypt plaintext string using AES-256-GCM
  public encryptMessage(text: string): { encryptedContent: string; iv: string; authTag: string } {
    try {
      const iv = crypto.randomBytes(12); // 96-bit IV
      const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag().toString('hex');

      return {
        encryptedContent: encrypted,
        iv: iv.toString('hex'),
        authTag,
      };
    } catch (error: any) {
      logger.error('[EncryptionService] Encryption failed:', error);
      throw new AppError('Message encryption failed', 500);
    }
  }

  // Decrypt ciphertext using AES-256-GCM and verify integrity with Auth Tag
  public decryptMessage(encryptedContent: string, ivHex: string, authTagHex: string): string {
    try {
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const encrypted = Buffer.from(encryptedContent, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error: any) {
      logger.error('[EncryptionService] Decryption failed (potential tampering or invalid key/tag):', error.message);
      throw new AppError('Message decryption failed: content integrity verification failed', 400);
    }
  }
}
