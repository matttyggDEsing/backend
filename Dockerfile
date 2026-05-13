# ============================================================
# NexaPanel Backend — Dockerfile
# Runtime: Node.js 20 LTS Alpine
# ============================================================

# ── Etapa base ───────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app

# Instalar dependencias del sistema necesarias
RUN apk add --no-cache dumb-init

# Copiar manifiestos primero para aprovechar la caché de capas
COPY package*.json ./


# ── Etapa de desarrollo ──────────────────────────────────────
FROM base AS development
ENV NODE_ENV=development

RUN npm install

COPY . .

EXPOSE 5000
CMD ["npx", "nodemon", "server.js"]


# ── Etapa de producción ──────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production

# Instalar solo dependencias de producción
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Crear directorio de logs con permisos correctos
RUN mkdir -p logs && chown -R node:node /app

# Usar usuario no-root
USER node

EXPOSE 5000

# dumb-init maneja señales correctamente (para PM2 o node directo)
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
