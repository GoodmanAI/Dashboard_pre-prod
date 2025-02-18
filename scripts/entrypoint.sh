#!/bin/sh
./wait-for-it.sh db:5432 -t 30

npx prisma migrate deploy

npm run seed

npm run start
