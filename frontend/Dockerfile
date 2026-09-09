# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files from frontend directory (context is repo root)
COPY frontend/package*.json ./

# Install ALL dependencies (including devDependencies) for build
# terser is needed for production minification
RUN npm install --include=dev

# Copy frontend source
COPY frontend/ ./
RUN npm run build

# Production stage
FROM nginx:alpine AS production

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Templates in /etc/nginx/templates are rendered by the nginx image's
# entrypoint, which substitutes environment variables into them at start-up.
COPY frontend/nginx.conf.template /etc/nginx/templates/default.conf.template

# Platforms that inject PORT (Cloud Run, Render, Railway, Fly.io) override this.
ENV PORT=3000
EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]



