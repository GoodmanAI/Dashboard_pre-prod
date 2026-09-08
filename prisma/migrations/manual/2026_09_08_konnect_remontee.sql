-- Migration manuelle : ce que Konnect remonte au Dashboard
--
-- Lot E du plan `plans/2026-09-konnect-angles-morts-console.md`.
--
-- POURQUOI CETTE TABLE EXISTE. Le Dashboard sait tout de la CONFIGURATION d'un
-- centre Konnect, et rien de son ÉTAT. Il ne peut pas dire si les SMS partent
-- vraiment, ni où les patients abandonnent : ces faits vivent chez Konnect.
--
-- ET IL NE POURRA JAMAIS ALLER LES CHERCHER. Konnect passe derrière un VPN, le
-- Dashboard est sur un VPS public : aucun appel du Dashboard vers Konnect ne
-- l'atteindrait. Le seul sens possible est un push de Konnect, comme pour les
-- demandes de rappel. Décision du 08/09/2026, `DECISIONS.md`.
--
-- CE QUI PEUT ENTRER ICI, ET CE QUI NE LE PEUT PAS :
--
--   · des FAITS que Konnect observe et que le Dashboard ne peut pas déduire :
--     état d'un canal d'envoi, agrégats de parcours, volumes ;
--   · jamais de la CONFIGURATION. Elle appartient au Dashboard, et une remontée
--     qui l'écraserait rouvrirait la double vérité fermée le 28/08/2026 ;
--   · jamais de donnée patient. Ce sont des agrégats. La seule donnée patient de
--     cette base reste `KonnectDemandeRappel`, décidée le 02/09/2026.
--
-- UNE SEULE LIGNE PAR CENTRE, REMPLACÉE À CHAQUE REMONTÉE. C'est un état courant,
-- pas un journal : personne n'a besoin de savoir ce que les SMS faisaient mardi.
-- Le jour où une série temporelle sera nécessaire (lot F, statistiques), elle aura
-- sa propre table plutôt que de faire grossir celle-ci.
--
-- `charge` est du JSON libre, et c'est délibéré : le Dashboard ne valide pas la
-- forme de ce que Konnect observe, il l'affiche. Figer un schéma ici obligerait à
-- une migration à chaque fait nouveau, pour une donnée que personne ne requête.
-- Ce que le Dashboard EXIGE est vérifié dans la route, pas dans la table.
--
-- Table hors `schema.prisma`, comme les autres tables Konnect : la base porte
-- déjà des tables absentes du schéma, et `prisma migrate dev` proposerait un reset
-- qui les emporterait toutes.
--
-- Idempotent : sûr à rejouer.

BEGIN;

CREATE TABLE IF NOT EXISTS "KonnectRemontee" (
  "id"            serial PRIMARY KEY,
  "userProductId" integer NOT NULL,

  -- Ce que Konnect a observé, tel qu'il l'a envoyé.
  "charge"        jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Horodaté PAR LE DASHBOARD à la réception, jamais par l'émetteur : une horloge
  -- décalée sur la VM Konnect ferait passer une remontée périmée pour fraîche, et
  -- c'est précisément la fraîcheur qui décide si l'écran peut s'y fier.
  "recuAt"        timestamp with time zone NOT NULL DEFAULT NOW(),

  "createdAt"     timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt"     timestamp with time zone NOT NULL DEFAULT NOW(),

  CONSTRAINT "KonnectRemontee_userProductId_key" UNIQUE ("userProductId"),
  CONSTRAINT "KonnectRemontee_userProductId_fkey"
    FOREIGN KEY ("userProductId") REFERENCES "UserProduct"("id") ON DELETE CASCADE
);

COMMIT;

-- Vérif :
--   \d "KonnectRemontee"
--   SELECT "userProductId", "recuAt", jsonb_pretty("charge") FROM "KonnectRemontee";
--
-- Rollback :
--   DROP TABLE IF EXISTS "KonnectRemontee";
--     -- Sans conséquence : aucune configuration ne vit ici. Les écrans qui la
--     -- lisent retombent sur « pas encore reçu », leur état de départ.
