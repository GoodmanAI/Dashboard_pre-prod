# Étape 1 : Construction
FROM node:18-alpine AS builder
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer toutes les dépendances
RUN npm install

# Copier le dossier prisma pour que le schéma soit disponible
COPY prisma ./prisma

# Générer le client Prisma
RUN npx prisma generate

# Copier le reste du code et construire l’application Next.js
COPY . .
RUN npm run build

# Étape 2 : Image finale
FROM node:18-alpine
WORKDIR /app

# Installer uniquement les dépendances en production
COPY package*.json ./
RUN npm install --only=production

# Copier les artefacts construits depuis l’étape builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js .

# Copier les scripts bash et les rendre exécutables
COPY wait-for-it.sh /app/wait-for-it.sh
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/wait-for-it.sh /app/entrypoint.sh

EXPOSE 3000

CMD ["npm", "start"]
