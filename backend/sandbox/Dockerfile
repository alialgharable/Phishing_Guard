
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app

# Install native build tools required by better-sqlite3.
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 \
       make \
       g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev --foreground-scripts

COPY dist ./dist

RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin pguser && \
    mkdir -p /profile /tmp/pg && \
    chown -R pguser:pguser /app /profile /tmp/pg

USER 10001:10001

ENV PG_IN_SANDBOX=1

ENTRYPOINT ["node", "dist/src/services/dynamic/cli.js"]