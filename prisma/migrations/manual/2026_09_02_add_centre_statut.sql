-- Migration manuelle : statut de cycle de vie d'un centre
--
-- Lot 1 du plan `plans/2026-09-completude-config-centres.md`.
--
-- Un centre en cours d'installation n'a pas les mêmes exigences qu'un centre qui
-- prend des appels, et un centre arrêté n'en a aucune. Sans cette distinction,
-- les alertes de configuration à venir s'allumeraient partout à la fois : quatre
-- centres du groupe Quimper passeraient en rouge pour des manques parfaitement
-- normaux, et neuf clients découvriraient le même matin que leur configuration
-- est incomplète depuis des mois. C'est le bruit qui fait qu'on cesse de lire
-- les alertes.
--
-- TROIS NOTIONS D'ÉTAT EXISTENT DÉJÀ, et celle-ci n'en remplace aucune :
--   - `UserProduct.removedAt` : le client n'a plus le produit. Toutes les
--     requêtes filtrent dessus, donc le centre DISPARAÎT des écrans. Ce n'est
--     pas un centre arrêté, qui doit garder son historique visible.
--   - `TalkSettings.options.serviceEnabled` : le robot répond, ou transfère
--     tout. Opérationnel, réversible à la minute, actionnable par le client.
--   - `DeploymentStatus` : l'état git et PM2 des VMs. Aucun rapport.
--
-- **Le statut ne pilote rien d'autre que l'affichage.** Il ne coupe pas le
-- robot, ne retire pas l'affiliation, ne touche pas `serviceEnabled`. Un centre
-- classé `arrete` dont le service tourne encore est une incohérence à signaler,
-- pas à corriger d'autorité : le Dashboard n'a pas à décider seul de couper le
-- téléphone d'un cabinet.
--
-- **L'ABSENCE DE LIGNE VAUT `integration`**, et ce défaut n'est pas neutre. Il
-- rend le classement volontaire : rien ne s'allume tant qu'un administrateur
-- n'a pas déclaré un centre en production. C'est le même grain que le
-- rattachement Konnect, et c'est ce qui rend le retour arrière gratuit —
-- reclasser un centre en intégration éteint ses alertes sans redéploiement ni
-- migration inverse.
--
-- Clé sur `userProductId`, donc UN STATUT PAR COUPLE CLIENT × PRODUIT : un
-- cabinet peut prendre des appels depuis six mois et ouvrir son portail patient
-- la semaine prochaine.
--
-- Pas de table d'historique : la ligne courante porte `depuis`, `note` et
-- `majPar`, ce qui suffit à savoir qui a basculé quoi et pourquoi. Un historique
-- complet des transitions serait du zèle pour une donnée qui change deux fois
-- dans la vie d'un centre.
--
-- Pourquoi une migration manuelle plutôt que Prisma : la base porte déjà treize
-- tables absentes de `schema.prisma`. `prisma migrate dev` détecte cette dérive
-- et propose un reset qui les emporterait toutes. Cette table rejoint la famille
-- SQL manuel, comme `KonnectSettings` et `ProductConfig`.
--
-- ⚠️ Ce fichier n'est PAS joué par `entrypoint.sh`, qui ne lance que
-- `prisma migrate deploy`. Il s'applique à la main, cf. « Vérif » plus bas.
--
-- Idempotent : sûr à rejouer.

BEGIN;

CREATE TABLE IF NOT EXISTS "CentreStatut" (
  "userProductId" integer PRIMARY KEY,

  -- 'integration' : on installe, les manques sont normaux.
  -- 'production'  : le centre prend des demandes de patients.
  -- 'arrete'      : le service ne tourne plus, l'historique reste consultable.
  -- Le CHECK est un contrat avec `src/lib/centreStatut.ts` : une quatrième
  -- valeur écrite en base rendrait le comportement des alertes indéterminé.
  "statut"        text NOT NULL DEFAULT 'integration',

  -- Depuis quand le centre est dans cet état. Mis à jour à chaque CHANGEMENT de
  -- statut, pas à chaque écriture : corriger une note ne redate pas la bascule.
  "depuis"        timestamp with time zone NOT NULL DEFAULT NOW(),

  -- Texte libre, pour l'équipe. « en attente des numéros du groupe »,
  -- « migration vers Montchanin ». Jamais affiché à un client.
  "note"          text,

  -- Qui a classé. `SET NULL` et non `CASCADE` : un administrateur qui quitte
  -- l'entreprise ne doit pas emporter le classement de trente centres.
  "majPar"        integer,

  "createdAt"     timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt"     timestamp with time zone NOT NULL DEFAULT NOW(),

  CONSTRAINT "CentreStatut_statut_check"
    CHECK ("statut" IN ('integration', 'production', 'arrete')),

  CONSTRAINT "CentreStatut_userProductId_fkey"
    FOREIGN KEY ("userProductId") REFERENCES "UserProduct"("id") ON DELETE CASCADE,

  CONSTRAINT "CentreStatut_majPar_fkey"
    FOREIGN KEY ("majPar") REFERENCES "User"("id") ON DELETE SET NULL
);

-- Lecture par statut : c'est l'accès de la page de parc (« montre-moi ce qui est
-- en production ») et, plus tard, du compteur « N autres centres incomplets »,
-- qui ne compte que les centres en production.
CREATE INDEX IF NOT EXISTS "CentreStatut_statut_idx"
  ON "CentreStatut" ("statut");

COMMIT;

-- Vérif :
--   psql "$DATABASE_URL" -f prisma/migrations/manual/2026_09_02_add_centre_statut.sql
--   \d "CentreStatut"
--   SELECT COUNT(*) FROM "CentreStatut";   -- 0 au départ : tous les centres
--                                          -- sont donc en intégration, donc
--                                          -- silencieux. C'est voulu.
--
-- Rollback :
--   DROP TABLE IF EXISTS "CentreStatut";
--     -- Sans conséquence : tous les centres retombent en intégration, aucune
--     -- alerte ne s'affiche, et rien d'autre dans l'application ne lit cette
--     -- table. Le classement est perdu, pas la configuration.
