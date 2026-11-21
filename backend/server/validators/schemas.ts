/**
 * Request validation utilities for CRYO Enterprise ERP 2.0.
 * Prepares the codebase for schema-based validation in Phase 3.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateRequired(data: Record<string, any>, requiredFields: string[]): ValidationResult {
  const errors: string[] = [];
  for (const field of requiredFields) {
    const val = data[field];
    if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
      errors.push(`Field '${field}' is required.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validatePositiveNumber(value: unknown, fieldName: string): string | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return `${fieldName} must be a positive number.`;
  }
  return null;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validateDateString(val?: string | null): boolean {
  if (!val) return false;
  const d = new Date(val);
  return !Number.isNaN(d.getTime());
}
