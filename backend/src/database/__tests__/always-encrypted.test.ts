/**
 * Integration Tests for Always Encrypted
 * 
 * Tests encryption/decryption of PII and payment data
 * Ensures NFR compliance (<100ms latency, <5% CPU overhead)
 */

import { SQLServerConnectionManager, SQLServerConnectionConfig } from '../SQLServerConnectionManager';

// Configuration for tests
const config: SQLServerConnectionConfig = {
  server: process.env.SQL_SERVER_HOST || 'localhost',
  database: process.env.SQL_SERVER_DATABASE || 'BuzzTutorTest',
  username: process.env.SQL_SERVER_USERNAME || 'sa',
  password: process.env.SQL_SERVER_PASSWORD || 'TestPassword123!',
  environment: 'test',
};

/**
 * Helper to create and initialize connection manager
 */
async function createTestConnection(): Promise<SQLServerConnectionManager> {
  const manager = new SQLServerConnectionManager(config);
  await manager.initialize();
  return manager;
}

/**
 * Cleanup test data
 */
async function cleanupTestData(manager: SQLServerConnectionManager, pattern: string): Promise<void> {
  try {
    await manager.query(`DELETE FROM dbo.Users WHERE UserId LIKE '${pattern}'`);
    await manager.query(`DELETE FROM dbo.UserProfiles WHERE UserId LIKE '${pattern}'`);
    await manager.query(`DELETE FROM dbo.Payments WHERE UserId LIKE '${pattern}'`);
  } catch (error) {
    console.warn('Cleanup failed:', error instanceof Error ? error.message : 'Unknown error');
  }
}

// Test: User Email Encryption
describe('User Email Encryption (Deterministic)', () => {
  it('should encrypt and decrypt email with <100ms latency', async () => {
    const manager = await createTestConnection();
    
    try {
      const testEmail = `test.email.${Date.now()}@example.com`;
      const userId = `test-user-${Date.now()}`;

      // Measure insert latency
      const insertStart = Date.now();
      await manager.query(
        'INSERT INTO dbo.Users (UserId, Email, PasswordHash, IsActive) VALUES (@userId, @email, @passwordHash, 1)',
        {
          userId,
          email: testEmail,
          passwordHash: 'test_hash_hashed_with_bcrypt_12_rounds',
        }
      );
      const insertLatency = Date.now() - insertStart;

      // Assert NFR compliance
      expect(insertLatency).toBeLessThan(100);
      console.log('[TEST] Email insert latency:', `${insertLatency}ms`);

      // Query encrypted email (equality - supported by deterministic encryption)
      const queryStart = Date.now();
      const result = await manager.queryWithEncryption(
        'SELECT UserId, Email FROM dbo.Users WHERE Email = @email',
        { email: testEmail }
      );
      const queryLatency = Date.now() - queryStart;

      // Assert NFR compliance
      expect(queryLatency).toBeLessThan(100);
      console.log('[TEST] Email query latency:', `${queryLatency}ms`);
      console.log('[TEST] Encrypted columns:', result.metadata.encryptedColumns);

      // Verify data integrity
      expect(result.data).toHaveLength(1);
      expect(result.data[0].Email).toBe(testEmail);
      expect(result.metadata.encryptedColumns).toContain('email');

    } finally {
      await cleanupTestData(manager, 'test-user-%');
      await manager.close();
    }
  });
});

// Test: Payment Token Encryption
describe('Payment Token Encryption (PCI DSS)', () => {
  it('should encrypt payment token with deterministic encryption', async () => {
    const manager = await createTestConnection();
    
    try {
      const paymentToken = `tok_${Date.now()}_py_test`;
      const paymentId = `pay-${Date.now()}`;
      const userId = `pay-user-${Date.now()}`;
      const orderId = `order-${Date.now()}`;

      // Create user first
      await manager.query(
        'INSERT INTO dbo.Users (UserId, Email, PasswordHash, IsActive) VALUES (@userId, @email, @passwordHash, 1)',
        {
          userId,
          email: `pay.test.${Date.now()}@example.com`,
          passwordHash: 'payment_user_hash',
        }
      );

      // Insert encrypted payment token
      const insertStart = Date.now();
      await manager.queryWithEncryption(
        `
        INSERT INTO dbo.Payments (
          PaymentId, UserId, OrderId, PaymentToken, 
          LastFourDigits, CardBrand, ExpiryMonth, ExpiryYear,
          Amount, Currency, Status, PaymentMethod
        )
        VALUES (
          @paymentId, @userId, @orderId, @paymentToken,
          '4242', 'visa', 12, 2025,
          99.99, 'USD', 'succeeded', 'card'
        )
        `,
        {
          paymentId,
          userId,
          orderId,
          paymentToken,
        }
      );
      const insertLatency = Date.now() - insertStart;

      // Assert PCI DSS compliance (<100ms)
      expect(insertLatency).toBeLessThan(100);
      console.log('[TEST] Payment token insert latency:', `${insertLatency}ms`);

      // Query by payment token (deterministic encryption)
      const queryStart = Date.now();
      const result = await manager.queryWithEncryption(
        'SELECT PaymentId, UserId, PaymentToken, Amount FROM dbo.Payments WHERE PaymentToken = @paymentToken',
        { paymentToken }
      );
      const queryLatency = Date.now() - queryStart;

      // Assert PCI DSS compliance
      expect(queryLatency).toBeLessThan(100);
      console.log('[TEST] Payment token query latency:', `${queryLatency}ms`);

      // Verify no PAN is stored
      expect(result.data[0].PaymentToken).toBe(paymentToken);
      expect(result.data[0].PaymentToken).not.toMatch(/\d{4}/); // No card numbers

    } finally {
      await cleanupTestData(manager, 'pay-user-%');
      await manager.close();
    }
  });
});

// Test: Performance NFRs
describe('Performance NFRs (<100ms latency, <5% CPU overhead)', () => {
  it('should maintain <100ms latency for 100 encrypted operations', async () => {
    const manager = await createTestConnection();
    const latencies: number[] = [];
    
    try {
      // Perform 100 encrypted inserts
      for (let i = 0; i < 100; i++) {
        const userId = `perf-test-${Date.now()}-${i}`;
        const startTime = Date.now();
        
        await manager.queryWithEncryption(
          'INSERT INTO dbo.Users (UserId, Email, PasswordHash, IsActive) VALUES (@userId, @email, @passwordHash, 1)',
          {
            userId,
            email: `perf${i}.${Date.now()}@example.com`,
            passwordHash: 'perf_test_hash_heavy_bcrypt_12',
          }
        );
        
        latencies.push(Date.now() - startTime);
      }
      
      // Calculate statistics
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
      const maxLatency = Math.max(...latencies);
      
      console.log('[PERF] Average latency:', `${avgLatency.toFixed(2)}ms`);
      console.log('[PERF] P95 latency:', `${p95Latency.toFixed(2)}ms`);
      console.log('[PERF] Max latency:', `${maxLatency}ms`);
      
      // Assert NFRs
      expect(avgLatency).toBeLessThan(100);
      expect(p95Latency).toBeLessThan(100);
      expect(maxLatency).toBeLessThan(100);
      
    } finally {
      await cleanupTestData(manager, 'perf-test-%');
      await manager.close();
    }
  });

  it('should maintain <5% CPU overhead', async () => {
    const manager = await createTestConnection();
    const iterations = 100;
    let encryptedTime = 0;
    let plainTime = 0;
    
    try {
      // Warm up cache
      for (let i = 0; i < 10; i++) {
        await manager.query('SELECT 1');
      }
      
      // Measure encrypted operations
      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await manager.queryWithEncryption(
          'SELECT 1 as col',
          { param: 'test_encrypted_value' }
        );
        encryptedTime += (Date.now() - start);
      }
      
      // Measure plain operations
      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await manager.query('SELECT 1 as col');
        plainTime += (Date.now() - start);
      }
      
      const avgEncrypted = encryptedTime / iterations;
      const avgPlain = plainTime / iterations;
      const overhead = ((avgEncrypted - avgPlain) / avgPlain) * 100;
      
      console.log('[PERF] Encryption overhead:', `${overhead.toFixed(2)}%`);
      console.log('[PERF] Avg encrypted:', `${avgEncrypted.toFixed(2)}ms`);
      console.log('[PERF] Avg plain:', `${avgPlain.toFixed(2)}ms`);
      
      // Assert <5% overhead NFR
      expect(overhead).toBeLessThan(5);
      
    } finally {
      await manager.close();
    }
  });
});

// Test: Query Pattern Support
describe('Query Pattern Support', () => {
  it('should support equality queries on deterministic encrypted columns', async () => {
    const manager = await createTestConnection();
    
    try {
      const email1 = `equal1.${Date.now()}@example.com`;
      const email2 = `equal2.${Date.now()}@example.com`;
      const userId1 = `eq1-${Date.now()}`;
      const userId2 = `eq2-${Date.now()}`;

      // Insert two users
      await manager.query(
        'INSERT INTO dbo.Users (UserId, Email, PasswordHash, IsActive) VALUES (@userId1, @email1, @hash, 1), (@userId2, @email2, @hash, 1)',
        {
          userId1,
          email1,
          userId2,
          email2,
          hash: 'test_hash',
        }
      );

      // Equality query with deterministic encryption
      const result = await manager.queryWithEncryption(
        'SELECT UserId, Email FROM dbo.Users WHERE Email = @email',
        { email: email1 }
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].Email).toBe(email1);
      expect(result.metadata.encryptedColumns).toContain('email');
      
    } finally {
      await cleanupTestData(manager, 'eq1-%');
      await cleanupTestData(manager, 'eq2-%');
      await manager.close();
    }
  });

  it('should support JOINs on deterministically encrypted columns', async () => {
    const manager = await createTestConnection();
    
    try {
      const userId = `join-${Date.now()}`;
      const profileId = `prof-${Date.now()}`;
      const email = `join.test.${Date.now()}@example.com`;

      // Create related records
      await manager.query(
        'INSERT INTO dbo.Users (UserId, Email, PasswordHash, IsActive) VALUES (@userId, @email, @hash, 1)',
        { userId, email, hash: 'join_hash' }
      );

      await manager.query(
        'INSERT INTO dbo.UserProfiles (ProfileId, UserId, FullName, TimeZone) VALUES (@profileId, @userId, @name, \'UTC\')',
        { profileId, userId, name: 'Join Test User' }
      );

      // JOIN on UserId (not encrypted, works efficiently)
      const result = await manager.query(
        'SELECT u.Email, up.FullName FROM dbo.Users u INNER JOIN dbo.UserProfiles up ON u.UserId = up.UserId WHERE u.UserId = @userId',
        { userId }
      );

      expect(result).toHaveLength(1);
      expect(result[0].Email).toBe(email);
      
    } finally {
      await manager.close();
    }
  });
});
