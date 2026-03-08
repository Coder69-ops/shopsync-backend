# ShopSync AI — Backend (NestJS)

The core API engine for the ShopSync AI platform. Built with NestJS, Prisma ORM, and BullMQ.

## 🚀 Tech Stack
- **Framework:** [NestJS](https://nestjs.com/)
- **Database:** [PostgreSQL](https://www.postgresql.org/)
- **ORM:** [Prisma](https://www.prisma.io/)
- **Queue:** [BullMQ](https://docs.bullmq.io/) (Redis)
- **AI Integration:** Google Gemini, GROQ, OpenRouter
- **Communication:** Facebook Graph API (Messenger & Comments)

## 🛠️ Local Development

### 1. Prerequisites
- Node.js (v18+)
- PostgreSQL Instance
- Redis Instance

### 2. Installation
```bash
npm install
```

### 3. Database Setup
```bash
# Generate Prisma Client
npx prisma generate

# Apply migrations
npx prisma migrate dev
```

### 4. Running the App
```bash
# development
npm run start:dev

# production
npm run start:prod
```

## 🚢 Deployment & CI/CD
This repository is deployed independently via **Dokploy**.

1. **Source:** GitHub (`Coder69-ops/shopsync-backend`).
2. **CI/CD:** Automatic rebuilds on push to `main`.
3. **Environment Variables:** Ensure `DATABASE_URL`, `REDIS_HOST`, `FB_APP_SECRET`, etc. are configured in Dokploy.
4. **Build Automation:** The `start:prod` script automatically handles `prisma generate` and `prisma migrate deploy`, ensuring your schema is always in sync with production.

## 🔗 Repository Split
This is part of the ShopSync AI platform. The frontend repository can be found at: `Coder69-ops/shopsync-frontend`.

## 📂 Key Modules
- **Auth:** JWT-based authentication with trial management.
- **AI:** Multi-provider LLM brain with failover logic.
- **Webhook:** Processes Facebook Messenger & Comment events via BullMQ.
- **Marketing:** Bulk broadcast campaign management.
- **Order:** AI-extracted and manual order management.

---
Built with ❤️ by the ShopSync Team.
