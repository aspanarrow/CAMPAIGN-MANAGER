import { signToken, verifyToken, hashPassword, comparePassword } from '../../../src/services/auth.service';

describe('auth.service', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('supersecret123');
    expect(hash).not.toBe('supersecret123');
    expect(await comparePassword('supersecret123', hash)).toBe(true);
    expect(await comparePassword('wrong', hash)).toBe(false);
  });

  it('signs and verifies JWT tokens', () => {
    const token = signToken({ userId: 'u1', email: 'a@b.com', role: 'ADMIN' });
    expect(typeof token).toBe('string');
    const payload = verifyToken(token);
    expect(payload.userId).toBe('u1');
    expect(payload.role).toBe('ADMIN');
  });

  it('rejects invalid tokens', () => {
    expect(() => verifyToken('garbage.token.here')).toThrow();
  });
});
