# The Wallflower server with its built UI. Boards live in WALLFLOWER_DATA; mount a volume there.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY server/env.mjs server/env.mjs
COPY public public
COPY src src
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production WALLFLOWER_HOST=0.0.0.0 WALLFLOWER_DATA=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY bin bin
COPY server server
COPY --from=build /app/dist dist
EXPOSE 8787
CMD ["node", "bin/wallflower.mjs", "serve"]
