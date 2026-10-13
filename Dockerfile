# Docker image for the web app: a multi-stage build that compiles the React/Vite site and serves it with
# nginx (see nginx.conf).
# Build with the public values as build args, e.g. docker build --build-arg VITE_SUPABASE_URL=...
# --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... --build-arg VITE_API_URL=https://api.example.com/api/v1 .
# These values are baked into the bundle at build time (changing them needs a rebuild) and are public by
# nature; never pass the Supabase service-role key.

# Stage 1 ("build"): compile the React app with Node. Nothing from this stage except dist/ ends up in the
# final image.
FROM node:22-alpine AS build
WORKDIR /app
# Copy only the dependency files first so Docker can cache the (slow) npm install layer until they change.
COPY package.json package-lock.json ./
# Clean install of the exact versions in package-lock.json.
RUN npm ci
# Now copy the source (.dockerignore keeps node_modules, dist and .env files out).
COPY . .
# VITE_* values are baked into the bundle at build time. Only the PUBLISHABLE key belongs here.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_API_URL
# tsc type-check, then vite build -> /app/dist. The three ARG values above are visible to this step and Vite
# embeds them in the JavaScript. VITE_AUTH_BYPASS is not declared as an ARG here, so a Docker build always
# has the login enabled (bypass stays off).
RUN npm run build

# Stage 2: small nginx image that only serves the static files.
FROM nginx:1.27-alpine
# Our server config (SPA fallback, caching, security headers).
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Copy the finished site out of the build stage.
COPY --from=build /app/dist /usr/share/nginx/html
# Documentation only: the container listens on port 80 (publish it with -p or the host's port setting).
EXPOSE 80
