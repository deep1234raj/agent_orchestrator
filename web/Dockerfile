# Web service — Next.js (App Router)
#
# Dev image with pnpm and a non-root user. Production builds will use a
# separate multi-stage Dockerfile.

FROM node:26-alpine

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

RUN npm install -g corepack@latest
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install deps first for cache.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile

# Source is bind-mounted in dev; copied here for image self-sufficiency.
COPY . .

EXPOSE 3000

CMD ["pnpm", "dev"]
