import { registroSchema } from '../validators/schemas.js';

describe('validators', () => {
  test('registroSchema rejects weak password', () => {
    const result = registroSchema.safeParse({
      nome: 'Teste User',
      email: 'teste@example.com',
      senha: '12345678',
      tipo: 'PACIENTE',
    });

    expect(result.success).toBe(false);
  });

  test('registroSchema accepts strong password', () => {
    const result = registroSchema.safeParse({
      nome: 'Teste User',
      email: 'teste@example.com',
      senha: 'Senha@123',
      tipo: 'PACIENTE',
    });

    expect(result.success).toBe(true);
  });
});
