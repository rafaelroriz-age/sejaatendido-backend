import { z } from 'zod';

// =====================
// AUTH SCHEMAS
// =====================
export const registroSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  tipo: z.enum(['PACIENTE', 'MEDICO', 'ADMIN']),
});

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  senha: z.string().min(1, 'Senha obrigatória'),
});

export const loginGoogleSchema = z.object({
  idToken: z.string().min(1, 'idToken é obrigatório'),
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
  crm: z.string().min(4, 'CRM inválido').optional(),
  especialidades: z.array(z.string()).optional(),
});

// =====================
// USUÁRIO SCHEMAS
// =====================
export const atualizarUsuarioSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres').optional(),
  email: z.string().email('Email inválido').optional(),
});

export const alterarSenhaSchema = z.object({
  senhaAtual: z.string().min(1, 'Senha atual obrigatória'),
  novaSenha: z.string().min(6, 'Nova senha deve ter no mínimo 6 caracteres'),
});

export const adminCriarUsuarioSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  tipo: z.enum(['PACIENTE', 'MEDICO', 'ADMIN']),
  crm: z.string().min(4, 'CRM inválido').optional(),
  especialidades: z.array(z.string()).optional(),
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

// =====================
// EMAIL SCHEMAS
// =====================
export const enviarEmailSchema = z.object({
  destinatario: z.string().email('Email de destinatário inválido'),
  assunto: z.string().min(1, 'Assunto obrigatório'),
  corpo: z.string().min(1, 'Corpo do email obrigatório'),
});
