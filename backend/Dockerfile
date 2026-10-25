FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --workspace=@pulsechat/backend
COPY backend backend
RUN mkdir -p /app/backend/uploads && chown -R node:node /app/backend/uploads
USER node
WORKDIR /app/backend
EXPOSE 4000
CMD ["sh", "-c", "node src/database/migrate.js && node src/server.js"]
