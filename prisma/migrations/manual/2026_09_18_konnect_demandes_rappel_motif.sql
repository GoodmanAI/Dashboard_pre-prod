-- Demandes de rappel LyraeKonnect : motif, priorité, lien vers l'ordonnance.
-- Plan : lyrae/plans/2026-09-konnect-demandes-bloquees.md (18/09/2026).
--
-- POURQUOI. Jusqu'ici une seule situation déposait une demande de rappel : l'examen
-- n'est pas réservable en ligne. Désormais plusieurs chemins du portail y arrivent
-- (plusieurs examens, ordonnance illisible, aucun créneau, incident de réservation,
-- contre-indication à vérifier). La secrétaire doit savoir pourquoi rappeler, filtrer
-- par cas, et voir les urgences en tête de file.
--
-- CE QUI N'ENTRE PAS ICI, et ne doit jamais y entrer : le détail médical. Le motif
-- `contre_indication` dit « contre-indication à vérifier », pas laquelle. Décision du
-- client du 18/09/2026 ; la table reste la seule de cette base à porter de la donnée
-- patient, limitée à nom, prénom, téléphone et libellé d'examen.
--
-- `lienOrdonnance` : un lien sécurisé vers l'ordonnance dans Konnect, à durée de vie
-- limitée. Ce n'est pas l'ordonnance : le fichier reste chez Konnect, qui le purge.
--
-- Additif et idempotent. Les lignes existantes prennent le motif historique.

BEGIN;

ALTER TABLE "KonnectDemandesRappel"
  ADD COLUMN IF NOT EXISTS "motif" text NOT NULL DEFAULT 'examen_non_reservable';

-- 'haute' | 'normale'. Déduite du motif par la route, jamais fournie par l'appelant.
ALTER TABLE "KonnectDemandesRappel"
  ADD COLUMN IF NOT EXISTS "priorite" text NOT NULL DEFAULT 'normale';

ALTER TABLE "KonnectDemandesRappel"
  ADD COLUMN IF NOT EXISTS "lienOrdonnance" text;

-- La file : à rappeler d'abord, les urgences en tête, puis les plus anciennes.
CREATE INDEX IF NOT EXISTS "KonnectDemandesRappel_file_idx"
  ON "KonnectDemandesRappel" ("userProductId", "statut", "priorite", "createdAt");

COMMIT;
