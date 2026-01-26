process.env.NODE_ENV = 'test';
process.env.JWT_SEGREDO = process.env.JWT_SEGREDO || 'test-secret-123456789012345678901234';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Prisma-required envs (not used in unit tests, but required by EnvSchema)
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/sejaatendido_test?schema=public';
process.env.DIRECT_URL =
  process.env.DIRECT_URL || 'postgresql://user:pass@localhost:5432/sejaatendido_test';

process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
process.env.BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
