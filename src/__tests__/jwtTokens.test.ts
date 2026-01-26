import { signAccessToken, verifyAccessToken } from '../utils/authTokens.js';

describe('authTokens', () => {
  test('signAccessToken/verifyAccessToken roundtrip', () => {
    const signed = signAccessToken({ userId: 'user-123', tipo: 'PACIENTE' });
    const payload = verifyAccessToken(signed.token);

    expect(payload.sub).toBe('user-123');
    expect(payload.tipo).toBe('PACIENTE');
    expect(typeof payload.jti).toBe('string');
    expect(payload.jti.length).toBeGreaterThan(10);
  });
});
