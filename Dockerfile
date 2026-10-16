FROM node:22-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/backend
ENV NODE_ENV=production
COPY --from=backend-build /app/backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=backend-build /app/backend/dist ./dist
EXPOSE 8787
USER node
CMD ["node", "dist/src/server/main.js"]
