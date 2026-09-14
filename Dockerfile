FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files & install pnpm
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy seluruh source code
COPY . .

# Environment & Command
ENV NODE_ENV=production
CMD ["pnpm", "start"]