FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src

ENV WWEBJS_CHROME_PATH=/usr/bin/chromium
ENV PORT=8788
EXPOSE 8788

CMD ["npm", "start"]
