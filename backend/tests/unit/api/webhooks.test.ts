import crypto from 'crypto';

function verifyShopifyHmac(rawBody: Buffer, hmacHeader: string | undefined, secret: string): boolean {
  if (!secret || !hmacHeader) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

describe('webhook HMAC verification', () => {
  const secret = 'test-secret';
  const body = Buffer.from(JSON.stringify({ id: 123 }));

  it('accepts a valid Shopify HMAC', () => {
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');
    expect(verifyShopifyHmac(body, hmac, secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');
    expect(verifyShopifyHmac(Buffer.from('tampered'), hmac, secret)).toBe(false);
  });

  it('rejects missing header', () => {
    expect(verifyShopifyHmac(body, undefined, secret)).toBe(false);
  });
});
