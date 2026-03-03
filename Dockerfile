# Build Stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN rm -f package-lock.json
RUN npm install

COPY . .

# Force cache invalidation to ensure Prisma schema and migrations are picked up
RUN echo "Cache Bust 2026-02-17-v4"

RUN npx prisma generate
RUN npm run build

# Production Stage
FROM node:22-alpine

# Install OpenSSL (v3) so Prisma can detect it
RUN apk add --no-cache openssl

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD [ "npm", "run", "start:prod" ]
