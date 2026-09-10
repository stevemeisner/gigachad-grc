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

# Vite inlines VITE_* variables at build time, so the target Firebase project
# has to be known when the image is built.
#
# The Firebase web API key is a PUBLIC client identifier, not a secret: it only
# names the project the SDK talks to, and it ships inside the JS bundle either
# way. Access is enforced by server-side ID token verification.
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID

# Pre-fills the domain in Google's account chooser. Cosmetic only - it filters
# nothing, and ALLOWED_EMAIL_DOMAINS on the API is what actually rejects an
# address. Inlined at build time like the values above, so it is a build arg
# rather than runtime env.
ARG VITE_ALLOWED_EMAIL_DOMAIN
ENV VITE_ALLOWED_EMAIL_DOMAIN=$VITE_ALLOWED_EMAIL_DOMAIN

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



