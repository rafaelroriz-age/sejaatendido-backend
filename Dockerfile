# Stage 1: build
FROM node:18-bullseye-slim AS builder
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

# Copia arquivos de dependências e instala
COPY package*.json ./
# Prisma schema precisa existir durante o npm ci para o postinstall do @prisma/client gerar o client
COPY prisma ./prisma
# Se usar yarn/pnpm, substitua por COPY yarn.lock . / RUN yarn --frozen-lockfile
RUN npm ci

# Copia o restante do código e roda build (ajuste se não usar TypeScript)
COPY . .
RUN npm run build

# Stage 2: runtime
FROM node:18-bullseye-slim AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PORT=3001
ENV PORTA=3001

# Runtime deps (Prisma precisa de OpenSSL no container)
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ca-certificates \
		openssl \
	&& rm -rf /var/lib/apt/lists/*

# Copia artefatos do build
COPY --from=builder --chown=node:node /usr/src/app/package*.json ./
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/dist ./dist

USER node
EXPOSE 3001

# Ajuste o comando abaixo conforme o ponto de entrada real do seu projeto.
# Ex: ["node", "dist/server.js"] ou ["npm", "start"]
CMD ["node", "dist/index.js"]