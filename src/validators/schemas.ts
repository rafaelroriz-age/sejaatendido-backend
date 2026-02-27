import { z } from 'zod';

const crmSchema = z
  .string()
  .trim()
  .toUpperCase()
  // Mantém propositalmente simples: ex "CRM/SP 12345" ou "CRM-SP 12345".
  .refine((v) => /^CRM\s*[-/]?\s*[A-Z]{2}\s*\d{3,10}$/.test(v), 'CRM inválido');

const senhaForteSchema = z
  .string()
  .min(8, 'Senha deve ter no mínimo 8 caracteres')
  .max(72, 'Senha deve ter no máximo 72 caracteres')
  .refine((v) => /[A-Z]/.test(v), 'Senha deve conter letra maiúscula')
  .refine((v) => /[a-z]/.test(v), 'Senha deve conter letra minúscula')
  .refine((v) => /\d/.test(v), 'Senha deve conter número')
  .refine((v) => /[^A-Za-z0-9]/.test(v), 'Senha deve conter caractere especial');

// =====================
// AUTH SCHEMAS
// =====================
export const registroSchema = z.object({
  nome: z.string().trim().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().trim().email('Email inválido'),
  senha: senhaForteSchema,
  tipo: z.enum(['PACIENTE', 'MEDICO']).optional(),
  role: z.enum(['PACIENTE', 'MEDICO']).optional(),
  crm: crmSchema.optional(),
  diplomaAnexado: z.boolean().optional(),
})
  .superRefine((data, ctx) => {
    const resolvedTipo = data.tipo ?? data.role;
    if (!resolvedTipo) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tipo'], message: 'tipo é obrigatório' });
      return;
    }

    if (resolvedTipo === 'MEDICO' && !data.crm) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['crm'], message: 'CRM é obrigatório para médicos' });
    }
  })
  .transform((data) => ({
    nome: data.nome,
    email: data.email,
    senha: data.senha,
    tipo: (data.tipo ?? data.role) as 'PACIENTE' | 'MEDICO',
    crm: data.crm,
    diplomaAnexado: data.diplomaAnexado,
  }));

export const loginSchema = z.object({
  email: z.string().trim().email('Email inválido'),
  senha: z.string().min(1, 'Senha obrigatória'),
});

export const recuperarSenhaSchema = z.object({
  email: z.string().trim().email('Email inválido'),
});

export const resetarSenhaSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
  novaSenha: senhaForteSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20, 'refreshToken inválido'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(20, 'refreshToken inválido').optional(),
});

export const loginGoogleSchema = z.object({
  idToken: z.string().min(1, 'idToken é obrigatório'),
});

// =====================
// COMMON PARAMS/QUERY SCHEMAS
// =====================
const uuidSchema = z.string().uuid('ID inválido');

export const idParamSchema = z.object({
  id: uuidSchema,
});

export const userIdParamSchema = z.object({
  userId: uuidSchema,
});

export const profissionalIdParamSchema = z.object({
  profissionalId: uuidSchema,
});

export const chatIdParamSchema = z.object({
  chatId: uuidSchema,
});

export const consultaIdBodySchema = z.object({
  consultaId: uuidSchema,
});

export const listProfissionaisQuerySchema = z.object({
  especialidade: z.string().trim().max(80).optional(),
  nome: z.string().trim().max(80).optional(),
});

// =====================
// CONSULTA SCHEMAS
// =====================
export const criarConsultaSchema = z.object({
  medicoId: z.string().uuid('ID do médico inválido'),
  data: z.string().datetime('Data inválida'),
  motivo: z.string().min(10, 'Motivo deve ter no mínimo 10 caracteres'),
});

export const atualizarConsultaSchema = z.object({
  status: z.enum(['PENDENTE', 'ACEITA', 'RECUSADA', 'CONCLUIDA', 'CANCELADA']).optional(),
  meetLink: z.string().url().optional(),
});

// =====================
// MÉDICO SCHEMAS
// =====================
export const atualizarMedicoSchema = z.object({
  crm: crmSchema.optional(),
  especialidades: z.array(z.string()).optional(),
});

// =====================
// USUÁRIO SCHEMAS
// =====================
export const atualizarUsuarioSchema = z.object({
  nome: z.string().trim().min(3, 'Nome deve ter no mínimo 3 caracteres').optional(),
  email: z.string().trim().email('Email inválido').optional(),
});

export const alterarSenhaSchema = z.object({
  senhaAtual: z.string().min(1, 'Senha atual obrigatória'),
  novaSenha: senhaForteSchema,
});

export const usuarioSearchSchema = z.object({
  q: z.string().trim().min(1, 'q é obrigatório').max(80),
  especialidade: z.string().trim().max(80).optional(),
});

export const consultaStatusSchema = z.object({
  status: z.enum(['PENDENTE', 'ACEITA', 'RECUSADA', 'CONCLUIDA', 'CANCELADA']),
});

export const consultaLinkVideoSchema = z.object({
  meetLink: z.string().url('meetLink inválido'),
});

export const criarAvaliacaoSchema = z.object({
  consultaId: z.string().uuid('consultaId inválido'),
  nota: z.number().int().min(1).max(5),
  comentario: z.string().trim().max(2000).optional(),
});

export const atualizarAvaliacaoSchema = z.object({
  nota: z.number().int().min(1).max(5).optional(),
  comentario: z.string().trim().max(2000).optional(),
});

export const chatMensagemApiSchema = z.object({
  recipientId: z.string().uuid('recipientId inválido'),
  message: z.string().min(1, 'Mensagem obrigatória').max(2000, 'Mensagem muito longa'),
});

export const adminCriarUsuarioSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  tipo: z.enum(['PACIENTE', 'MEDICO', 'ADMIN']),
  crm: crmSchema.optional(),
  especialidades: z.array(z.string()).optional(),
})
  .superRefine((data, ctx) => {
    if (data.tipo === 'MEDICO' && !data.crm) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['crm'], message: 'CRM é obrigatório para médicos' });
    }
  });

export const adminMedicoRejeitarSchema = z.object({
  motivo: z.string().trim().min(3, 'Motivo deve ter no mínimo 3 caracteres').max(500, 'Motivo muito longo'),
});

export const adminAtualizarUsuarioSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres').optional(),
  email: z.string().email('Email inválido').optional(),
});

// =====================
// PAGAMENTO SCHEMAS
// =====================
export const criarPagamentoSchema = z.object({
  consultaId: z.string().uuid('ID da consulta inválido'),
  metodo: z.enum(['PIX', 'CARTAO']),
  valorCentavos: z.number().int().positive('Valor deve ser positivo'),
});

export const criarPagamentoPixSchema = z.object({
  consultaId: z.string().uuid('ID da consulta inválido'),
  valorCentavos: z.number().int().positive('Valor deve ser positivo').optional(),
});

export const criarPagamentoCartaoSchema = z.object({
  consultaId: z.string().uuid('ID da consulta inválido'),
  valorCentavos: z.number().int().positive('Valor deve ser positivo').optional(),
});

export const criarPagamentoMercadoPagoCheckoutSchema = z.object({
  consultaId: z.string().uuid('ID da consulta inválido'),
  valorCentavos: z.number().int().positive('Valor deve ser positivo').optional(),
  // URLs de retorno do Checkout Pro (podem ser deep links do Expo, ex: myapp://pagamento/sucesso)
  backUrlSuccess: z.string().trim().min(1).max(2000).optional(),
  backUrlPending: z.string().trim().min(1).max(2000).optional(),
  backUrlFailure: z.string().trim().min(1).max(2000).optional(),
});

// =====================
// EMAIL SCHEMAS
// =====================
export const enviarEmailSchema = z.object({
  destinatario: z.string().email('Email de destinatário inválido'),
  assunto: z.string().min(1, 'Assunto obrigatório'),
  corpo: z.string().min(1, 'Corpo do email obrigatório'),
});

// =====================
// CHAT SCHEMAS (MongoDB)
// =====================
export const chatEnviarMensagemSchema = z.object({
  appointmentId: z.string().uuid('ID da consulta inválido'),
  recipientId: z.string().uuid('ID do destinatário inválido'),
  message: z.string().min(1, 'Mensagem obrigatória').max(2000, 'Mensagem muito longa'),
});
