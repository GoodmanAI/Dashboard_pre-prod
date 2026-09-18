-- Migration manuelle : l'expediteur des messages Konnect se regle par cabinet
--
-- POURQUOI. Le patient recoit sa confirmation d'un expediteur commun a toute
-- l'instance du portail. Un centre veut que le mail arrive sous son nom et que le
-- SMS s'affiche sous le sien, pas sous celui de Lyrae.
--
-- CE QUI SE REGLE ICI : le NOM affiche du mail, et l'expediteur alphanumerique du
-- SMS. CE QUI NE SE REGLE PAS : l'ADRESSE d'expedition du mail. Elle doit etre
-- verifiee chez le prestataire d'envoi (compte Brevo partage), ce que le Dashboard
-- ne sait pas faire. Elle reste dans `TenantMessagingConfig` cote Konnect, posee a
-- l'installation.
--
-- NULL = l'expediteur de l'installation. Aucun defaut a inventer : un centre qui
-- ne regle rien garde exactement le comportement d'avant.
--
-- La forme (60 caracteres ; 3 a 11 lettres ou chiffres pour le SMS) est validee
-- par `normaliserConfigKonnect`, pas par une contrainte SQL : le message d'erreur
-- doit dire a la secretaire quoi corriger.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE "KonnectSettings"
  ADD COLUMN IF NOT EXISTS "expediteurNomMail" text,
  ADD COLUMN IF NOT EXISTS "expediteurSms" text;

COMMENT ON COLUMN "KonnectSettings"."expediteurNomMail" IS
  'Nom affiche comme expediteur des mails du portail. NULL = celui de l''installation. L''adresse, elle, ne se regle pas ici.';
COMMENT ON COLUMN "KonnectSettings"."expediteurSms" IS
  'Expediteur alphanumerique des SMS du portail, 3 a 11 caracteres. NULL = celui de l''installation.';

-- Verif :
--   SELECT "userProductId", "expediteurNomMail", "expediteurSms" FROM "KonnectSettings";
--
-- Rollback :
--   ALTER TABLE "KonnectSettings"
--     DROP COLUMN IF EXISTS "expediteurNomMail",
--     DROP COLUMN IF EXISTS "expediteurSms";
