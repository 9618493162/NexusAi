FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .
RUN npm run build
RUN npx prisma generate

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p uploads

EXPOSE 5000

CMD ["sh", "-c", "npx prisma db push && node dist/app.js"]
