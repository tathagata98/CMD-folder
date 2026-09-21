FROM mcr.microsoft.com/playwright:v1.63.0-noble

RUN apt-get update \
  && apt-get install -y --no-install-recommends xvfb fluxbox x11vnc novnc websockify \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci
RUN npx playwright install chrome
COPY . .

COPY docker/start.sh /usr/local/bin/start-playwright-dashboard
RUN chmod +x /usr/local/bin/start-playwright-dashboard

ENV DISPLAY=:99
EXPOSE 3000 6080
CMD ["start-playwright-dashboard"]