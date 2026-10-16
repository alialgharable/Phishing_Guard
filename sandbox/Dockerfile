FROM mcr.microsoft.com/playwright:v1.55.1-noble

WORKDIR /app
ENV HOST=0.0.0.0 \
    PORT=4001 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    SANDBOX_ARTIFACT_DIR=/tmp/phishguard-sandbox-artifacts

COPY package.json package-lock.json* ./
COPY sandbox/package.json ./sandbox/package.json
RUN npm ci --workspace @phishguard/sandbox-service --include-workspace-root=false

COPY sandbox ./sandbox
RUN npm --workspace @phishguard/sandbox-service run build \
    && npm prune --omit=dev --workspace @phishguard/sandbox-service --include-workspace-root=false

ENV NODE_ENV=production
USER pwuser
EXPOSE 4001
CMD ["node", "sandbox/dist/src/server.js"]
