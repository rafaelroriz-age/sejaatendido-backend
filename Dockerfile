# Stage 1: build
FROM node:20-bookworm-slim AS builder
LABEL maintainer="GitHub Copilot"
WORKDIR /usr/src/app
ENV NODE_ENV=development

# Instala ferramentas necessárias (removível se não usar bibliotecas nativas)
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ca-certificates \
		openssl \
		python3 \
		make \
		g++ \
	&& rm -rf /var/lib/apt/lists/*

# node:20-slim vem com npm v10; este repo usa lockfile gerado com npm v11
RUN npm install -g npm@11.7.0

# Copia arquivos de dependências e instala
COPY package*.json ./
# Prisma schema precisa existir durante o npm ci para o postinstall do @prisma/client gerar o client
COPY prisma ./prisma
# Se usar yarn/pnpm, substitua por COPY yarn.lock . / RUN yarn --frozen-lockfile
RUN npm ci

# Copia o restante do código e roda build (ajuste se não usar TypeScript)
COPY . .
RUN npm run build

# Stage 1.5: production dependencies only (avoid copying devDependencies into runtime)
FROM node:20-bookworm-slim AS prod-deps
WORKDIR /usr/src/app

# node:20-slim vem com npm v10; este repo usa lockfile gerado com npm v11
RUN npm install -g npm@11.7.0

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

# Stage 2: runtime
FROM node:20-bookworm-slim AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

# Runtime deps (Prisma precisa de OpenSSL no container)
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ca-certificates \
		openssl \
	&& rm -rf /var/lib/apt/lists/*

# Copia artefatos do build
COPY --from=builder --chown=node:node /usr/src/app/package*.json ./
COPY --from=prod-deps --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/dist ./dist
COPY --from=builder --chown=node:node /usr/src/app/prisma ./prisma

USER node
EXPOSE 3001

# Ajuste o comando abaixo conforme o ponto de entrada real do seu projeto.
# Ex: ["node", "dist/server.js"] ou ["npm", "start"]
CMD ["node", "dist/index.js"]