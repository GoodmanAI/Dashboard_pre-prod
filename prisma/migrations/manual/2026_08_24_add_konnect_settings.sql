-- Migration manuelle : configuration LyraeKonnect par centre
--
-- Étape 6 du plan `plans/2026-08-dashboard-multi-produit.md`. Le Dashboard
-- devient propriétaire de la configuration Konnect, sur le modèle exact de
-- `TalkSettings` : le client paramètre ici, et la brique consommatrice vient
-- lire — LyraeTalk via `GET /api/configuration`, Konnect via
-- `GET /api/konnect-configuration`.
--
-- Une ligne par centre (`userProductId` unique), créée à la demande.
--
-- Pourquoi une migration manuelle plutôt que Prisma : la base porte déjà onze
-- tables absentes de `schema.prisma`. `prisma migrate dev` détecte cette dérive
-- et propose un reset qui les emporterait toutes. Cette table rejoint donc la
-- famille SQL manuel, comme `KonnectTenantMapping` créée le même jour.
--
-- **Les valeurs par défaut ne sont pas neutres.** Elles reprennent une à une
-- celles de `cabinet_parametres` côté Konnect, qui sont délibérément
-- *fail-closed* : un cabinet non paramétré ne doit déclencher aucun traitement
-- sensible. `ocrActif` est la seule exception à `false` — côté Konnect, `false`
-- est le chemin PLUS contrôlé (saisie guidée, zéro langage libre), pas un
-- risque ; le défaut `true` préserve le parcours livré. Changer un de ces
-- défauts modifie le comportement du portail patient pour tout centre non
-- encore configuré.
--
-- Idempotent : sûr à rejouer.

BEGIN;

CREATE TABLE IF NOT EXISTS "KonnectSettings" (
  "id"            serial PRIMARY KEY,
  "userProductId" integer NOT NULL,

  -- --- Identité du centre ---
  -- Référence (URL) du logo. Aucun binaire stocké ici, comme côté Konnect.
  "logoUrl"                text,
  -- Concept Xplore `depComplHono` (dépassement / complément d'honoraires).
  "depassementHonoraires"  boolean NOT NULL DEFAULT false,
  "consignesGenerales"     text,
  -- Numéro affiché au patient dont le RDV est bloqué (« appelez le
  -- secrétariat »). Numéro public : aucune donnée patient.
  "telephoneSecretariat"   varchar(30),

  -- --- Notifications ---
  -- Canaux que le cabinet SOUHAITE proposer. La disponibilité réelle dépend du
  -- secret configuré côté Konnect (`tenant_messaging_config`) : cocher ici ne
  -- suffit pas à rendre un canal opérationnel.
  "envoiEmail"             boolean NOT NULL DEFAULT true,
  "envoiSms"               boolean NOT NULL DEFAULT true,

  -- --- Parcours patient ---
  -- Lecture automatique de l'ordonnance (cascade OCR). `false` bascule vers la
  -- saisie guidée ; la photo d'ordonnance reste TOUJOURS déposée.
  "ocrActif"               boolean NOT NULL DEFAULT true,
  -- "traditionnel" (liste, défaut historique) ou "anatomique" (schéma du corps
  -- mis en avant). N'affecte que l'écran « partie du corps ».
  "modeSaisieExamen"       varchar(20) NOT NULL DEFAULT 'traditionnel',
  -- Le patient choisit son radiologue : Konnect interroge alors le RIS
  -- (`getMedecins`) et transmet le choix à la création du RDV.
  "choixRadiologueActif"   boolean NOT NULL DEFAULT false,
  -- Bilan à deux examens réservable en ligne.
  "multiExamenActif"       boolean NOT NULL DEFAULT false,

  -- --- Sécurité clinique ---
  -- Questionnaire clinique + règles. À armer après relecture radiologue.
  "cliniqueActif"          boolean NOT NULL DEFAULT false,
  -- Seuils de gabarit, séparés IRM / scanner. NULL = question non posée.
  -- Au-delà du seuil, le RDV est bloqué et renvoyé au secrétariat.
  "poidsMaxIrmKg"          integer,
  "poidsMaxScannerKg"      integer,

  -- --- Interne technique (pas exposé au client) ---
  -- Consentement du cabinet à l'OCR cloud : l'image de l'ordonnance sort de
  -- l'infrastructure vers un prestataire HDS. Gate RGPD par cabinet, en plus
  -- de l'interrupteur global de Konnect. Reste sur la page interne.
  "cloudOcrActif"          boolean NOT NULL DEFAULT false,

  "createdAt"   timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt"   timestamp with time zone NOT NULL DEFAULT NOW(),

  CONSTRAINT "KonnectSettings_userProductId_key" UNIQUE ("userProductId"),
  CONSTRAINT "KonnectSettings_userProductId_fkey"
    FOREIGN KEY ("userProductId") REFERENCES "UserProduct"("id") ON DELETE CASCADE,
  -- Le mode de saisie est un contrat avec Konnect (`pivot.enums.ModeSaisieExamen`) :
  -- une valeur inconnue casserait l'écran « partie du corps » du portail patient.
  CONSTRAINT "KonnectSettings_modeSaisieExamen_check"
    CHECK ("modeSaisieExamen" IN ('traditionnel', 'anatomique')),
  -- Un seuil de poids nul ou négatif n'a pas de sens et bloquerait tous les RDV.
  CONSTRAINT "KonnectSettings_poidsMaxIrmKg_check"
    CHECK ("poidsMaxIrmKg" IS NULL OR "poidsMaxIrmKg" >= 1),
  CONSTRAINT "KonnectSettings_poidsMaxScannerKg_check"
    CHECK ("poidsMaxScannerKg" IS NULL OR "poidsMaxScannerKg" >= 1)
);

COMMIT;

-- Vérif :
--   \d "KonnectSettings"
--   SELECT COUNT(*) FROM "KonnectSettings";   -- 0 au départ, créée à la demande
--
-- Rollback :
--   DROP TABLE IF EXISTS "KonnectSettings";
--     -- Sans conséquence tant qu'aucun centre n'a été configuré : la table est
--     -- recréée vide et les défauts fail-closed s'appliquent de nouveau.
