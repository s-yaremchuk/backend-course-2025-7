# Використовуємо Node.js версії 18 (або новішої)
FROM node:18-alpine

# Встановлюємо робочу директорію
WORKDIR /app

# Копіюємо package.json та package-lock.json
COPY package*.json ./

# Встановлюємо залежності
RUN npm install

# Копіюємо весь код проекту
COPY . .

# Відкриваємо порти для програми та дебаггера
EXPOSE 3000 9229

# Запуск у режимі розробки (використовує скрипт "dev" з package.json)
CMD ["npm", "run", "dev"]