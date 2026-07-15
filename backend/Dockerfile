FROM node:20-alpine

WORKDIR /app

# SQLite needs some compilation packages if using sqlite3 on alpine
RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5252

CMD ["node", "server.js"]
