# Backend Dockerfile for Railway/Production
# NOTE: build from the repository ROOT so the shared/ folder and the workspace
# package-lock.json are available, e.g.:
#   docker build -f backend/Dockerfile -t shopify-marketing-ai-backend .
FROM node:20-alpine

WORKDIR /app

# Install workspace dependencies
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci

# Copy backend sources, Prisma schema and shared schemas
COPY backend ./backend
COPY shared ./shared

WORKDIR /app/backend

# Generate Prisma client and compile TypeScript
RUN npx prisma generate \
  && npm run build

# Expose port
EXPOSE 5000

# Start server
CMD ["npm", "start"]

