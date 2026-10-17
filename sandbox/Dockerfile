FROM mcr.microsoft.com/playwright:v1.55.1-noble

WORKDIR /app

ENV HOST=0.0.0.0 \
    PORT=4001 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    SANDBOX_ARTIFACT_DIR=/tmp/phishguard-sandbox-artifacts

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY test ./test

RUN npm run build \
    && npm prune --omit=dev

ENV NODE_ENV=production

USER pwuser
EXPOSE 4001
CMD ["node", "dist/src/server.js"]
