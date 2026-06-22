import { EncryptionService } from '../encryption.service';
import { AppError } from '../../utils/errors';

describe('EncryptionService Cryptographic Unit Tests', () => {
  let encryptionService: EncryptionService;
  const samplePlaintext = 'Hello, this is a highly confidential message!';

  beforeAll(() => {
    encryptionService = new EncryptionService();
  });

  it('should encrypt a plaintext string successfully, returning hex properties', () => {
    const result = encryptionService.encryptMessage(samplePlaintext);

    expect(result).toBeDefined();
    expect(result.encryptedContent).toMatch(/^[0-9a-f]+$/i);
    expect(result.iv).toHaveLength(24); // 12 bytes = 24 hex characters
    expect(result.authTag).toHaveLength(32); // 16 bytes = 32 hex characters
  });

  it('should decrypt an encrypted payload back to the exact original plaintext', () => {
    const encrypted = encryptionService.encryptMessage(samplePlaintext);
    const decrypted = encryptionService.decryptMessage(
      encrypted.encryptedContent,
      encrypted.iv,
      encrypted.authTag
    );

    expect(decrypted).toBe(samplePlaintext);
  });

  it('should throw an operational AppError if the ciphertext is tampered with', () => {
    const encrypted = encryptionService.encryptMessage(samplePlaintext);

    // Modify ciphertext (e.g. change last character of hex string)
    const tamperedContent =
      encrypted.encryptedContent.slice(0, -1) +
      (encrypted.encryptedContent.slice(-1) === '0' ? '1' : '0');

    expect(() => {
      encryptionService.decryptMessage(
        tamperedContent,
        encrypted.iv,
        encrypted.authTag
      );
    }).toThrow(AppError);

    expect(() => {
      encryptionService.decryptMessage(
        tamperedContent,
        encrypted.iv,
        encrypted.authTag
      );
    }).toThrow('content integrity verification failed');
  });

  it('should throw an operational AppError if the Initialization Vector (IV) is modified', () => {
    const encrypted = encryptionService.encryptMessage(samplePlaintext);

    // Modify IV
    const tamperedIv =
      encrypted.iv.slice(0, -1) + (encrypted.iv.slice(-1) === '0' ? '1' : '0');

    expect(() => {
      encryptionService.decryptMessage(
        encrypted.encryptedContent,
        tamperedIv,
        encrypted.authTag
      );
    }).toThrow(AppError);
  });

  it('should throw an operational AppError if the Authentication Tag is modified', () => {
    const encrypted = encryptionService.encryptMessage(samplePlaintext);

    // Modify Auth Tag
    const tamperedAuthTag =
      encrypted.authTag.slice(0, -1) +
      (encrypted.authTag.slice(-1) === '0' ? '1' : '0');

    expect(() => {
      encryptionService.decryptMessage(
        encrypted.encryptedContent,
        encrypted.iv,
        tamperedAuthTag
      );
    }).toThrow(AppError);
  });
});
