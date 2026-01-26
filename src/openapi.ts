import { ENV } from './env.js';

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'SejaAtendido API',
    version: '1.0.0',
  },
  servers: [{ url: ENV.BACKEND_URL || 'http://localhost:3001' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          erro: { type: 'string' },
          detalhes: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/auth/registrar': { post: { summary: 'Registrar', tags: ['Auth'] } },
    '/api/auth/login': { post: { summary: 'Login', tags: ['Auth'] } },
    '/api/auth/logout': { post: { summary: 'Logout', tags: ['Auth'] } },
    '/api/auth/refresh-token': { post: { summary: 'Refresh token', tags: ['Auth'] } },

    '/api/usuarios/{id}': {
      get: { summary: 'Obter usuário', tags: ['Usuarios'], parameters: [{ name: 'id', in: 'path', required: true }] },
      put: { summary: 'Atualizar usuário', tags: ['Usuarios'], parameters: [{ name: 'id', in: 'path', required: true }] },
      delete: { summary: 'Deletar usuário', tags: ['Usuarios'], parameters: [{ name: 'id', in: 'path', required: true }] },
    },
    '/api/usuarios/profissionais': { get: { summary: 'Listar profissionais', tags: ['Usuarios'] } },
    '/api/usuarios/search': { get: { summary: 'Buscar profissionais', tags: ['Usuarios'] } },

    '/api/consultas/agendar': { post: { summary: 'Agendar consulta', tags: ['Consultas'] } },
    '/api/consultas/{id}': { get: { summary: 'Obter consulta', tags: ['Consultas'], parameters: [{ name: 'id', in: 'path', required: true }] } },
    '/api/consultas/usuario/{userId}': {
      get: {
        summary: 'Listar consultas por usuário',
        tags: ['Consultas'],
        parameters: [{ name: 'userId', in: 'path', required: true }],
      },
    },
    '/api/consultas/{id}/status': { put: { summary: 'Atualizar status', tags: ['Consultas'], parameters: [{ name: 'id', in: 'path', required: true }] } },
    '/api/consultas/{id}/cancelar': { post: { summary: 'Cancelar consulta', tags: ['Consultas'], parameters: [{ name: 'id', in: 'path', required: true }] } },
    '/api/consultas/{id}/link-video': { post: { summary: 'Definir link de vídeo', tags: ['Consultas'], parameters: [{ name: 'id', in: 'path', required: true }] } },

    '/api/avaliacoes/criar': { post: { summary: 'Criar avaliação', tags: ['Avaliacoes'] } },
    '/api/avaliacoes/profissional/{profissionalId}': {
      get: {
        summary: 'Listar avaliações por profissional',
        tags: ['Avaliacoes'],
        parameters: [{ name: 'profissionalId', in: 'path', required: true }],
      },
    },
    '/api/avaliacoes/{id}': {
      put: { summary: 'Atualizar avaliação', tags: ['Avaliacoes'], parameters: [{ name: 'id', in: 'path', required: true }] },
      delete: { summary: 'Deletar avaliação', tags: ['Avaliacoes'], parameters: [{ name: 'id', in: 'path', required: true }] },
    },

    '/api/chats/iniciar': { post: { summary: 'Iniciar chat', tags: ['Chats'] } },
    '/api/chats/usuario/{userId}': {
      get: { summary: 'Listar chats do usuário', tags: ['Chats'], parameters: [{ name: 'userId', in: 'path', required: true }] },
    },
    '/api/chats/{chatId}/mensagens': {
      get: { summary: 'Listar mensagens', tags: ['Chats'], parameters: [{ name: 'chatId', in: 'path', required: true }] },
      post: { summary: 'Enviar mensagem', tags: ['Chats'], parameters: [{ name: 'chatId', in: 'path', required: true }] },
    },
    '/api/chats/{chatId}/marcar-lidas': {
      put: { summary: 'Marcar mensagens como lidas', tags: ['Chats'], parameters: [{ name: 'chatId', in: 'path', required: true }] },
    },

    '/health': { get: { summary: 'Health check', tags: ['Health'], security: [] } },
  },
} as const;
