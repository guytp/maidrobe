import {
  validateEmail,
  validatePassword,
  validateLoginPassword,
} from '../../src/features/auth/utils/validation';

describe('Email Validation', () => {
  it('should validate correct email addresses', () => {
    const result = validateEmail('user@example.com');
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject empty email', () => {
    const result = validateEmail('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Email is required');
  });

  it('should reject invalid email format', () => {
    const invalidEmails = ['invalid', 'invalid@', '@example.com', 'invalid@.com'];

    invalidEmails.forEach((email) => {
      const result = validateEmail(email);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Please enter a valid email address');
    });
  });

  it('should accept valid email formats', () => {
    const validEmails = [
      'user@example.com',
      'user.name@example.com',
      'user+tag@example.co.uk',
      'user123@test-domain.com',
    ];

    validEmails.forEach((email) => {
      const result = validateEmail(email);
      expect(result.isValid).toBe(true);
    });
  });
});

describe('Password Validation', () => {
  it('should validate password meeting all requirements', () => {
    const result = validatePassword('SecurePass123');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject empty password', () => {
    const result = validatePassword('');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password is required');
  });

  it('should reject password shorter than 8 characters', () => {
    const result = validatePassword('Pass1');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password must be at least 8 characters');
  });

  it('should reject password without uppercase letter', () => {
    const result = validatePassword('password123');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one uppercase letter');
  });

  it('should reject password without lowercase letter', () => {
    const result = validatePassword('PASSWORD123');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one lowercase letter');
  });

  it('should reject password without number', () => {
    const result = validatePassword('PasswordABC');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one number');
  });

  it('should return multiple errors for multiple violations', () => {
    const result = validatePassword('pass');
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it('should accept passwords meeting minimum requirements', () => {
    const validPasswords = ['Password1', 'SecurePass123', 'MyP@ssw0rd', 'Abcdefgh1'];

    validPasswords.forEach((password) => {
      const result = validatePassword(password);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});

describe('Login Password Validation', () => {
  it('should accept any non-empty password', () => {
    const passwords = ['weak', 'simple', 'pass', 'a', '123', 'SecurePass123'];

    passwords.forEach((password) => {
      const result = validateLoginPassword(password);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  it('should reject empty password', () => {
    const result = validateLoginPassword('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Password is required');
  });

  it('should not check password complexity requirements', () => {
    // These would fail signup validation but should pass login validation
    const weakPasswords = ['weak', 'pass', '123', 'abc'];

    weakPasswords.forEach((password) => {
      const result = validateLoginPassword(password);
      expect(result.isValid).toBe(true);
    });
  });
});
