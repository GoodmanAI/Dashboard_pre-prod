/**
 * Les deux processus du dépôt sur le VPS (décision d'Enzo du 24/11/2026, plan
 * lyrae/plans/2026-11-pilot-dans-le-dashboard.md, « Cloisons »).
 *
 * - `dashboard` existe déjà (`npm start`, port 3000) : ne pas le recréer, il ne
 *   change pas.
 * - `pilot` est le second : le même build (`.next`), le même `.env`, le port 3001.
 *   nginx y envoie `pilote.dashboard.neuracorp.ai` (deploy/pilote.dashboard.neuracorp.ai.nginx).
 *
 * Première pose, depuis /var/www/Dashboard_pre-prod :
 *   sudo pm2 start deploy/ecosystem.config.js --only pilot && sudo pm2 save
 * Ensuite, chaque déploiement redémarre les deux après le build :
 *   sudo pm2 restart dashboard pilot
 *
 * Ce qu'il faut savoir des deux processus :
 * - aucune tâche planifiée ne tourne dans Next (les crons sont système) : rien n'est
 *   fait deux fois ;
 * - le socket des notifications est propre à chaque processus : une notification née
 *   dans l'un arrive dans l'autre au prochain relevé de la cloche (60 s au plus) ;
 * - Next ne charge le `.env` qu'au démarrage : changer une variable demande de
 *   redémarrer les deux.
 */
module.exports = {
  apps: [
    {
      name: "pilot",
      cwd: __dirname + "/..",
      script: "npm",
      args: "run start:pilot",
      env: { NODE_ENV: "production" },
      // Une fuite mémoire de Pilot redémarre Pilot, jamais le Dashboard.
      max_memory_restart: "1500M",
      autorestart: true,
    },
  ],
};
