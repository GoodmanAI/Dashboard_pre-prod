Dashboard Pre-Prod
Ce dépôt contient une application Dashboard Next.js (front et back) connectée à une base de données PostgreSQL via Prisma. Le déploiement est réalisé à l'aide de Docker et Docker Compose. Des scripts d'automatisation permettent d'exécuter les migrations, de semer (seed) la base de données (création du compte admin et d'une trentaine de comptes clients) et de gérer le lancement complet de l'application.

Prérequis
Pour lancer ce projet en local, assurez-vous d'avoir installé sur votre machine :

Docker et Docker Compose
Git
Configuration
À la racine du projet, créez un fichier .env contenant au minimum les variables suivantes :

dotenv
Copier
# PostgreSQL
POSTGRES_USER=your_postgres_user
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_DB=your_database_name
DATABASE_URL=postgresql://your_postgres_user:your_postgres_password@db:5432/your_database_name?schema=public

# JWT secret pour NextAuth
JWT_SECRET=your_jwt_secret

# Clé API Admin pour les routes protégées
ADMIN_API_KEY=your_admin_api_key

# Configuration SMTP (pour l'envoi d'e-mails via nodemailer)
SMTP_USER=your_smtp_user
SUPPORT_EMAIL=your_support_email@example.com
Note : Remplacez your_postgres_user, your_postgres_password, etc., par vos propres valeurs.

Structure du Projet
Dockerfile : Instructions pour construire l'image Docker de l'application Next.js.
docker-compose.yml : Orchestration des conteneurs (web et PostgreSQL).
entrypoint.sh : Script d'initialisation qui attend que la DB soit prête, exécute les migrations Prisma, lance le seed, puis démarre l'application.
prisma/ : Contient le schéma Prisma (schema.prisma) et les migrations.
src/ : Code source de l'application (pages, API routes, composants, etc.).
Lancement du Projet en Local
Cloner le Dépôt :

bash
Copier
git clone https://github.com/GoodmanAI/Dashboard_pre-prod.git
cd Dashboard_pre-prod
Construire et Lancer les Conteneurs Docker :

bash
Copier
docker-compose up --build
Cette commande va :

Dockerfile : Construire l'image de l'application Next.js en deux étapes (builder et image finale).
docker-compose.yml : Démarrer deux services :
db : Un conteneur PostgreSQL configuré avec les variables d'environnement du fichier .env. Les données sont persistées dans un volume.
web : Le conteneur de l'application Next.js, qui exécute le script d'initialisation contenu dans entrypoint.sh.
Entrypoint : Le script entrypoint.sh (via le script wait-for-it.sh) attend que la base de données soit disponible, exécute les migrations Prisma (npx prisma migrate deploy), lance le script de seed (npm run seed) pour créer le compte admin et une trentaine de comptes clients, puis démarre l'application.
Accéder à l'Application :

Une fois les conteneurs lancés, ouvrez votre navigateur et allez sur http://localhost:3000.

Commandes Utiles
Rebuild et Redémarrage des Conteneurs :

bash
Copier
docker-compose up --build
Arrêt des Conteneurs :

bash
Copier
docker-compose down
Exécuter Manuellement les Migrations :

bash
Copier
docker-compose exec web npx prisma migrate deploy
Exécuter Manuellement le Script de Seed :

bash
Copier
docker-compose exec web npm run seed
Développement Sans Docker
Pour développer sans Docker, assurez-vous que PostgreSQL est installé et en cours d'exécution, puis lancez :

bash
Copier
npm install
npm run dev
Vérifiez que la variable DATABASE_URL dans votre .env est correctement configurée pour se connecter à votre instance PostgreSQL locale.