import { ENV } from './env.js';

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'SejaAtendido API',
    version: '1.0.0',
    description:
      'API REST do SejaAtendido (Express + TypeScript + Prisma/Postgres). Rotas principais expostas em /api/* e Swagger UI em /docs.',
  },
  servers: [{ url: ENV.BACKEND_URL || 'http://localhost:3001' }],
  tags: [
    { name: 'Auth' },
    { name: 'Consultas' },
    { name: 'Avaliacoes' },
    { name: 'Pagamentos' },
    { name: 'Health' },
    { name: 'System' },
  ],
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
          detalhes: {
            type: 'array',
            items: { type: 'object' },
          },
        },
        required: ['erro'],
        additionalProperties: true,
      },
      TipoUsuario: {
        type: 'string',
        enum: ['PACIENTE', 'MEDICO', 'ADMIN'],
      },
      StatusConsulta: {
        type: 'string',
        enum: ['PENDENTE', 'ACEITA', 'RECUSADA', 'CONCLUIDA', 'CANCELADA'],
      },

      AuthRegisterRequest: {
        type: 'object',
        properties: {
          nome: { type: 'string', minLength: 3 },
          email: { type: 'string', format: 'email' },
          senha: {
            type: 'string',
            minLength: 8,
            description:
              'Senha forte (mínimo 8; maiúscula, minúscula, número e caractere especial).',
          },
          tipo: { $ref: '#/components/schemas/TipoUsuario', description: 'Somente PACIENTE ou MEDICO no registro.' },
        },
        required: ['nome', 'email', 'senha', 'tipo'],
        additionalProperties: false,
        example: { nome: 'João Silva', email: 'joao@example.com', senha: 'Senha@123', tipo: 'PACIENTE' },
      },
      AuthLoginRequest: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          senha: { type: 'string', minLength: 1 },
        },
        required: ['email', 'senha'],
        additionalProperties: false,
        example: { email: 'joao@example.com', senha: 'Senha@123' },
      },
      AuthTokensResponse: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'Compat legado: mesmo valor de accessToken.',
          },
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          usuario: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              nome: { type: 'string' },
              email: { type: 'string', format: 'email' },
              tipo: { $ref: '#/components/schemas/TipoUsuario' },
            },
            required: ['id', 'nome', 'email', 'tipo'],
            additionalProperties: false,
          },
        },
        required: ['accessToken', 'refreshToken'],
        additionalProperties: true,
      },
      AuthRefreshTokenRequest: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string', minLength: 20 },
        },
        required: ['refreshToken'],
        additionalProperties: false,
        example: { refreshToken: '...' },
      },
      AuthRefreshTokenResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
        },
        required: ['accessToken', 'refreshToken'],
        additionalProperties: true,
      },
      AuthLogoutRequest: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string', minLength: 20, nullable: true },
        },
        additionalProperties: false,
        example: { refreshToken: '...' },
      },
      MessageResponse: {
        type: 'object',
        properties: {
          mensagem: { type: 'string' },
        },
        required: ['mensagem'],
        additionalProperties: true,
      },

      ConsultaCreateRequest: {
        type: 'object',
        properties: {
          medicoId: { type: 'string', format: 'uuid' },
          data: { type: 'string', format: 'date-time' },
          motivo: { type: 'string', minLength: 10 },
        },
        required: ['medicoId', 'data', 'motivo'],
        additionalProperties: false,
        example: { medicoId: '00000000-0000-0000-0000-000000000000', data: '2026-01-30T14:00:00.000Z', motivo: 'Dor de cabeça há 3 dias' },
      },
      ConsultaUpdateStatusRequest: {
        type: 'object',
        properties: {
          status: { $ref: '#/components/schemas/StatusConsulta' },
        },
        required: ['status'],
        additionalProperties: false,
        example: { status: 'ACEITA' },
      },
      ConsultaSetVideoLinkRequest: {
        type: 'object',
        properties: {
          meetLink: { type: 'string', format: 'uri' },
        },
        required: ['meetLink'],
        additionalProperties: false,
        example: { meetLink: 'https://meet.google.com/abc-defg-hij' },
      },
      Consulta: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          medicoId: { type: 'string', format: 'uuid' },
          pacienteId: { type: 'string', format: 'uuid' },
          data: { type: 'string', format: 'date-time' },
          motivo: { type: 'string' },
          status: { $ref: '#/components/schemas/StatusConsulta' },
          meetLink: { type: 'string', format: 'uri', nullable: true },
          criadoEm: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'medicoId', 'pacienteId', 'data', 'motivo', 'status'],
        additionalProperties: true,
      },

      AvaliacaoCreateRequest: {
        type: 'object',
        properties: {
          consultaId: { type: 'string', format: 'uuid' },
          nota: { type: 'integer', minimum: 1, maximum: 5 },
          comentario: { type: 'string', maxLength: 2000, nullable: true },
        },
        required: ['consultaId', 'nota'],
        additionalProperties: false,
        example: { consultaId: '00000000-0000-0000-0000-000000000000', nota: 5, comentario: 'Excelente atendimento.' },
      },
      AvaliacaoUpdateRequest: {
        type: 'object',
        properties: {
          nota: { type: 'integer', minimum: 1, maximum: 5 },
          comentario: { type: 'string', maxLength: 2000, nullable: true },
        },
        additionalProperties: false,
        example: { nota: 4, comentario: 'Bom atendimento, mas atrasou um pouco.' },
      },
      Avaliacao: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          consultaId: { type: 'string', format: 'uuid' },
          medicoId: { type: 'string', format: 'uuid' },
          pacienteId: { type: 'string', format: 'uuid' },
          nota: { type: 'integer', minimum: 1, maximum: 5 },
          comentario: { type: 'string', nullable: true },
          criadoEm: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'consultaId', 'medicoId', 'pacienteId', 'nota'],
        additionalProperties: true,
      },
    },
    responses: {
      BadRequest: {
        description: 'Requisição inválida',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { erro: 'Dados inválidos' },
          },
        },
      },
      Unauthorized: {
        description: 'Não autenticado',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { erro: 'Token inválido ou expirado' },
          },
        },
      },
      Forbidden: {
        description: 'Sem permissão',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { erro: 'Sem permissão' },
          },
        },
      },
      NotFound: {
        description: 'Não encontrado',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { erro: 'Registro não encontrado' },
          },
        },
      },
    },
  },
  paths: {
    '/api/auth/registrar': {
      post: {
        tags: ['Auth'],
        summary: 'Registrar usuário',
        description: 'Cria um usuário PACIENTE ou MEDICO e retorna accessToken + refreshToken.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AuthRegisterRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Registrado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthTokensResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AuthLoginRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Autenticado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthTokensResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/api/auth/refresh-token': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh token',
        description: 'Rotaciona refresh token e emite novo access token.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AuthRefreshTokenRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Tokens atualizados',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthRefreshTokenResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout',
        description: 'Revoga refresh token (se enviado) e blocklista o access token apresentado (se houver).',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AuthLogoutRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Logout realizado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageResponse' },
                example: { mensagem: 'Logout realizado' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/consultas/agendar': {
      post: {
        tags: ['Consultas'],
        summary: 'Agendar consulta',
        description: 'Paciente agenda consulta com médico aprovado.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ConsultaCreateRequest' } },
          },
        },
        responses: {
          '201': {
            description: 'Consulta criada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Consulta' } },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/consultas/{id}': {
      get: {
        tags: ['Consultas'],
        summary: 'Obter consulta',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Consulta encontrada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Consulta' } },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/consultas/usuario/{userId}': {
      get: {
        tags: ['Consultas'],
        summary: 'Listar consultas por usuário',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Lista de consultas',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Consulta' },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/consultas/{id}/status': {
      put: {
        tags: ['Consultas'],
        summary: 'Atualizar status da consulta',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ConsultaUpdateStatusRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Consulta atualizada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Consulta' } },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/consultas/{id}/cancelar': {
      post: {
        tags: ['Consultas'],
        summary: 'Cancelar consulta',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Consulta cancelada',
            content: {
              'application/json': {
                type: 'object',
                properties: {
                  mensagem: { type: 'string' },
                  consulta: { $ref: '#/components/schemas/Consulta' },
                },
                required: ['mensagem', 'consulta'],
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/consultas/{id}/link-video': {
      post: {
        tags: ['Consultas'],
        summary: 'Definir link de vídeo',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ConsultaSetVideoLinkRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Consulta atualizada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Consulta' } },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/avaliacoes/criar': {
      post: {
        tags: ['Avaliacoes'],
        summary: 'Criar avaliação',
        description: 'Paciente avalia consulta concluída (nota 1..5).',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AvaliacaoCreateRequest' } },
          },
        },
        responses: {
          '201': {
            description: 'Avaliação criada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Avaliacao' } },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/avaliacoes/profissional/{profissionalId}': {
      get: {
        tags: ['Avaliacoes'],
        summary: 'Listar avaliações por profissional',
        security: [],
        parameters: [
          {
            name: 'profissionalId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Lista de avaliações',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Avaliacao' },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/api/avaliacoes/{id}': {
      put: {
        tags: ['Avaliacoes'],
        summary: 'Atualizar avaliação',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AvaliacaoUpdateRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Avaliação atualizada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Avaliacao' } },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Avaliacoes'],
        summary: 'Deletar avaliação',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Avaliação deletada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageResponse' },
                example: { mensagem: 'Avaliação deletada' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        security: [],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', example: '2026-02-09T17:00:00.000Z' },
                  },
                  required: ['status', 'timestamp'],
                },
                example: { status: 'ok', timestamp: '2026-02-09T17:00:00.000Z' },
              },
            },
          },
        },
      },
    },

    '/system/status': {
      get: {
        tags: ['System'],
        summary: 'Status do sistema',
        security: [],
        responses: {
          '200': {
            description: 'Online',
          },
          '500': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },

    '/pagamentos/mercadopago/checkout': {
      post: {
        tags: ['Pagamentos'],
        summary: 'Criar checkout Mercado Pago (PIX + cartão)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  consultaId: { type: 'string', format: 'uuid' },
                  valorCentavos: { type: 'integer', minimum: 1 },
                },
                required: ['consultaId'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Checkout criado' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },

    '/pagamentos/webhook/mercadopago': {
      post: {
        tags: ['Pagamentos'],
        summary: 'Webhook Mercado Pago',
        security: [],
        responses: {
          '200': { description: 'OK' },
          '201': { description: 'OK' },
        },
      },
    },

    '/pagamentos/mercadopago/retorno': {
      get: {
        tags: ['Pagamentos'],
        summary: 'Retorno Checkout Pro',
        security: [],
        responses: {
          '200': { description: 'HTML de retorno' },
        },
      },
    },
  },
} as const;
