# --- Build stage: compile the Vite SPA -------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (leverages layer cache)
COPY package*.json ./
RUN npm ci

COPY . .

# Vite reads these at build time; the hosting platform (Railway) injects
# them as build-time variables. Defaults match the local dev setup.
ARG VITE_API_URL=http://localhost:5000
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_ENABLE_OAUTH=false
ENV VITE_ENABLE_OAUTH=$VITE_ENABLE_OAUTH
ARG VITE_SUPABASE_URL=
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY=
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# --- Serve stage: nginx -------------------------------------------------
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
