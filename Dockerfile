FROM node:20-alpine

# 1. Install ffmpeg & libvips untuk pembuat stiker (WA sharp/ffmpeg)
RUN apk add --no-cache ffmpeg vips-dev build-base

# 2. Set working directory
WORKDIR /app

# 3. Copy file dependency & install pnpm
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# 4. Copy seluruh source code
COPY . .

# 5. Environment & Command
ENV NODE_ENV=production
EXPOSE 8000

CMD ["pnpm", "start"]