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

  test('registroSchema requires CRM for medico', () => {
    const result = registroSchema.safeParse({
      nome: 'Doutor Teste',
      email: 'doutor@example.com',
      senha: 'Senha@123',
      tipo: 'MEDICO',
    });

    expect(result.success).toBe(false);
  });

  test('registroSchema accepts medico with CRM (and role alias)', () => {
    const result = registroSchema.safeParse({
      nome: 'Doutor Teste',
      email: 'doutor@example.com',
      senha: 'Senha@123',
      role: 'MEDICO',
      crm: 'CRM/SP 12345',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tipo).toBe('MEDICO');
      expect(result.data.crm).toBe('CRM/SP 12345');
    }
  });
});
