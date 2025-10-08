import crypto from 'crypto';
import { logger } from '../logger';

/**
 * Configuration for data masking behavior
 */
export interface MaskingConfig {
  algorithm: 'sha256' | 'aes-256-gcm';
  key?: string;
  preserveFormat?: boolean;
  maskChar?: string;
  auditLog?: boolean;
}

/**
 * Default masking configuration
 */
const DEFAULT_MASKING_CONFIG: MaskingConfig = {
  algorithm: 'sha256',
  maskChar: '*',
  preserveFormat: true,
  auditLog: true,
};

/**
 * PII/PHI field types for identification
 */
export enum SensitiveFieldType {
  // Patient identifiers
  PATIENT_ID = 'patient_id',
  SSN = 'ssn',
  MRN = 'mrn', // Medical Record Number

  // Personal information
  FIRST_NAME = 'first_name',
  LAST_NAME = 'last_name',
  FULL_NAME = 'full_name',
  DATE_OF_BIRTH = 'date_of_birth',

  // Contact information
  EMAIL = 'email',
  PHONE = 'phone',
  ADDRESS = 'address',

  // Financial information
  INSURANCE_NUMBER = 'insurance_number',
  CREDIT_CARD = 'credit_card',

  // Medical information
  DIAGNOSIS = 'diagnosis',
  MEDICATION = 'medication',
  LAB_RESULT = 'lab_result',
}

/**
 * Utility class for masking and unmasking PII/PHI data
 */
export class DataMasking {
  private static instance: DataMasking;
  private readonly config: MaskingConfig;
  private readonly encryptionKey: Buffer;

  private constructor(config: Partial<MaskingConfig> = {}) {
    this.config = { ...DEFAULT_MASKING_CONFIG, ...config };
    this.encryptionKey = this.generateEncryptionKey();
  }

  public static getInstance(config?: Partial<MaskingConfig>): DataMasking {
    if (!DataMasking.instance) {
      DataMasking.instance = new DataMasking(config);
    }
    return DataMasking.instance;
  }

  /**
   * Generate or retrieve encryption key
   */
  private generateEncryptionKey(): Buffer {
    const key = this.config.key || process.env.DATA_MASKING_KEY;
    if (key) {
      return Buffer.from(key, 'hex');
    }

    // Generate a new key for development (should not be used in production)
    const newKey = crypto.randomBytes(32);
    if (this.config.auditLog) {
      logger.warn('Using generated encryption key for data masking. Set DATA_MASKING_KEY in production.');
    }
    return newKey;
  }

  /**
   * Mask sensitive data based on field type
   */
  public maskField(value: string, fieldType: SensitiveFieldType): string {
    if (!value || typeof value !== 'string') {
      return value;
    }

    if (this.config.auditLog) {
      logger.debug('Masking sensitive field', { fieldType, valueLength: value.length });
    }

    switch (fieldType) {
    case SensitiveFieldType.EMAIL:
      return this.maskEmail(value);
    case SensitiveFieldType.PHONE:
      return this.maskPhone(value);
    case SensitiveFieldType.SSN:
      return this.maskSSN(value);
    case SensitiveFieldType.DATE_OF_BIRTH:
      return this.maskDateOfBirth(value);
    case SensitiveFieldType.FIRST_NAME:
    case SensitiveFieldType.LAST_NAME:
      return this.maskName(value);
    case SensitiveFieldType.ADDRESS:
      return this.maskAddress(value);
    default:
      return this.maskGeneric(value);
    }
  }

  /**
   * Encrypt sensitive data for secure storage
   */
  public encrypt(value: string): string {
    if (!value) {
      return value;
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);

    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();
    const result = `${iv.toString('hex')  }:${  authTag.toString('hex')  }:${  encrypted}`;

    if (this.config.auditLog) {
      logger.debug('Data encrypted for secure storage');
    }

    return result;
  }

  /**
   * Decrypt previously encrypted data
   */
  public decrypt(encryptedValue: string): string {
    if (!encryptedValue) {
      return encryptedValue;
    }

    try {
      const parts = encryptedValue.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted value format');
      }

      const [, authTagHex, encrypted] = parts;
      if (!authTagHex || !encrypted) {
        throw new Error('Invalid encrypted value format');
      }

      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      if (this.config.auditLog) {
        logger.debug('Data decrypted from secure storage');
      }

      return decrypted;
    } catch (error) {
      logger.error('Failed to decrypt data', { error });
      throw new Error('Decryption failed');
    }
  }

  /**
   * Generate a pseudonymized identifier
   */
  public pseudonymize(value: string, salt?: string): string {
    const saltValue = salt || 'smile-interop-default-salt';
    const hash = crypto.createHash('sha256');
    hash.update(value + saltValue);

    const pseudonym = hash.digest('hex').substring(0, 16);

    if (this.config.auditLog) {
      logger.debug('Generated pseudonymized identifier');
    }

    return `pseudo_${pseudonym}`;
  }

  /**
   * Check if a value appears to contain PII/PHI
   */
  public containsSensitiveData(value: string): boolean {
    if (!value || typeof value !== 'string') {
      return false;
    }

    // Simple patterns for detecting potential PII/PHI
    const patterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN pattern
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email pattern
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone pattern
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card pattern
    ];

    return patterns.some(pattern => pattern.test(value));
  }

  // Private masking methods for specific field types

  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (!domain || !localPart) {
      return this.maskGeneric(email);
    }

    const maskedLocal = localPart.length > 2
      ? localPart[0] + this.config.maskChar!.repeat(localPart.length - 2) + localPart[localPart.length - 1]
      : this.config.maskChar!.repeat(localPart.length);

    return `${maskedLocal}@${domain}`;
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `${digits.substring(0, 3)}-***-${digits.substring(7)}`;
    }
    if (digits.length === 11) {
      return `${digits[0]}-${digits.substring(1, 4)}-***-${digits.substring(8)}`;
    }
    return this.maskGeneric(phone);
  }

  private maskSSN(ssn: string): string {
    const digits = ssn.replace(/\D/g, '');
    if (digits.length === 9) {
      return `***-**-${digits.substring(5)}`;
    }
    return this.maskGeneric(ssn);
  }

  private maskDateOfBirth(date: string): string {
    // Show only year, mask month and day
    if (date.includes('-')) {
      const [year] = date.split('-');
      return `${year}-**-**`;
    }
    if (date.includes('/')) {
      const parts = date.split('/');
      if (parts.length === 3) {
        return `**/**/${parts[2]}`;
      }
    }
    return this.maskGeneric(date);
  }

  private maskName(name: string): string {
    if (name.length <= 2) {
      return this.config.maskChar!.repeat(name.length);
    }
    return name[0] + this.config.maskChar!.repeat(name.length - 2) + name[name.length - 1];
  }

  private maskAddress(address: string): string {
    // Mask everything except the last word (likely city/state)
    const words = address.split(' ');
    if (words.length > 1) {
      const maskedWords = words.slice(0, -1).map(word =>
        this.config.maskChar!.repeat(word.length),
      );
      return [...maskedWords, words[words.length - 1]].join(' ');
    }
    return this.maskGeneric(address);
  }

  private maskGeneric(value: string): string {
    if (value.length <= 4) {
      return this.config.maskChar!.repeat(value.length);
    }
    return value.substring(0, 2) +
           this.config.maskChar!.repeat(value.length - 4) +
           value.substring(value.length - 2);
  }
}

/**
 * Convenience function to get the default masking instance
 */
export const dataMasking = DataMasking.getInstance();

/**
 * Utility function to mask an entire object based on field mapping
 */
export function maskObject<T extends Record<string, any>>(
  obj: T,
  fieldMapping: Record<keyof T, SensitiveFieldType>,
): T {
  const maskedObj = { ...obj };

  for (const [field, fieldType] of Object.entries(fieldMapping)) {
    if (obj[field] && typeof obj[field] === 'string') {
      (maskedObj as any)[field] = dataMasking.maskField(obj[field], fieldType);
    }
  }

  return maskedObj;
}