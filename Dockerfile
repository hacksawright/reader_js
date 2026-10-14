FROM mcr.microsoft.com/playwright:v1.49.1-noble

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV READER_HOST=0.0.0.0
ENV READER_PORT=5678
ENV READER_HEADLESS=true

EXPOSE 5678

CMD ["node", "src/index.js"]
