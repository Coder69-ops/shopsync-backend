# Build Stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY prisma ./prisma/

# Use npm ci for reproducible builds (requires package-lock.json)
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

# Production Stage
FROM node:22-alpine

# Install OpenSSL (v3) so Prisma can detect it
RUN apk add --no-cache openssl

WORKDIR /app

ARG FRONTEND_URL
ARG BACKEND_URL
ARG FACEBOOK_APP_ID
ARG FACEBOOK_APP_SECRET
ARG FACEBOOK_CONFIG_ID

ENV FRONTEND_URL=$FRONTEND_URL
ENV BACKEND_URL=$BACKEND_URL
ENV FACEBOOK_APP_ID=$FACEBOOK_APP_ID
ENV FACEBOOK_APP_SECRET=$FACEBOOK_APP_SECRET
ENV FACEBOOK_CONFIG_ID=$FACEBOOK_CONFIG_ID

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD [ "npm", "run", "start:prod" ]
