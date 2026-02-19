FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
# `npm ci` requires a package-lock.json; use `npm install` when lockfile is not present.
RUN npm install --only=production
COPY . ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
