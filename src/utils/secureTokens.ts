import crypto from 'crypto';

export function gerarTokenBase64Url(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Hex(valor: string): string {
  return crypto.createHash('sha256').update(valor).digest('hex');
}

export function gerarTokenEHash(bytes: number = 32): { token: string; tokenHash: string } {
  const token = gerarTokenBase64Url(bytes);
  return { token, tokenHash: sha256Hex(token) };
}
