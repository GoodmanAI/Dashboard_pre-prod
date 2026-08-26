-- Migration manuelle : `KonnectExamens` adopte le modèle de mapping de LyraeTalk
--
-- Correction du lot C, le jour même. La première version stockait un catalogue
-- autonome : le client devait saisir ses examens sur une page blanche. Or LyraeTalk
-- fait autrement, et mieux : le référentiel **NEURACORP** est pré-rempli (blob Azure,
-- via `/api/data/exams`), et le client ne remplit que les colonnes de SON RIS en face.
-- Un nouveau centre arrive donc avec toutes les lignes déjà là, à compléter.
--
-- Konnect adopte le même modèle. Les deux mappings restent **séparés** — un par
-- produit, chacun son écran, conformément au sélecteur de produit — mais ils partent
-- du même référentiel interne.
--
-- CORRESPONDANCE AVEC LE MAPPING DE TALK (`TalkSettings.exams`) :
--   codeExamen        <- codeExamen NEURACORP        (référentiel, clé)
--   typeExamen        <- typeExamen NEURACORP
--   libelle           <- libelle NEURACORP
--   codeExamenClient  <- codeExamen Client           (le code du RIS, saisi)
--   typeExamenClient  <- typeExamen Client
--   libelleClient     <- libelle Client
--   performed         <- performed                   (le centre pratique-t-il l'examen)
--
-- CE QUE KONNECT A EN PLUS DE TALK, et qui justifie un écran distinct :
--   ordoOblig           — l'ordonnance est obligatoire pour cet examen
--   listeAttenteActive  — le patient peut s'inscrire en liste d'attente
--   examenInjecte       — examen avec injection de produit de contraste
-- Ces trois réglages n'ont pas de sens pour le robot vocal : ils pilotent des écrans
-- du parcours web (dépôt d'ordonnance, inscription en liste d'attente, questionnaire
-- d'injection).
--
-- DESTRUCTIF, ET ASSUMÉ : la table est recréée. Elle a été créée le même jour et n'a
-- jamais reçu de données (vérifié en production : `count 0`). Le `DELETE` préalable
-- garde le script honnête si ce n'était pas le cas — il refuserait alors de tourner
-- plutôt que d'effacer un catalogue saisi.
--
-- Idempotent : sûr à rejouer.

BEGIN;

-- Garde-fou : si quelqu'un a saisi un catalogue entre-temps, on s'arrête ici plutôt
-- que de le perdre. Reprendre alors la migration à la main.
DO $$
DECLARE
  n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'KonnectExamens') THEN
    EXECUTE 'SELECT COUNT(*) FROM "KonnectExamens"' INTO n;
    IF n > 0 AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'KonnectExamens' AND column_name = 'codeExamenClient'
    ) THEN
      RAISE EXCEPTION
        'KonnectExamens contient % lignes dans l''ancien format. Migration interrompue : reprendre a la main.', n;
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "KonnectExamens";

CREATE TABLE "KonnectExamens" (
  "id"            serial PRIMARY KEY,
  "userProductId" integer NOT NULL,

  -- --- Référentiel NEURACORP (pré-rempli, non modifiable par le client) ---
  -- Clé de la ligne. C'est notre vocabulaire interne, commun à tous les centres et
  -- partagé avec LyraeTalk : il ne dépend d'aucun RIS.
  "codeExamen"    text NOT NULL,
  "typeExamen"    text,
  "libelle"       text,

  -- --- Équivalents chez le client (saisis) ---
  -- Le code de l'examen dans SON RIS. C'est celui que Konnect transmet à AI2Xplore
  -- pour créer le rendez-vous : vide, l'examen n'est pas réservable en ligne.
  "codeExamenClient"  text NOT NULL DEFAULT '',
  "typeExamenClient"  text NOT NULL DEFAULT '',
  -- Libellé affiché au patient. Vide -> on retombe sur le libellé NEURACORP.
  "libelleClient"     text NOT NULL DEFAULT '',

  -- Le centre pratique-t-il cet examen ? Décoché, la ligne reste visible dans
  -- l'écran mais n'est jamais proposée au patient. Défaut `true`, comme chez Talk.
  "performed"     boolean NOT NULL DEFAULT true,

  -- --- Propre à LyraeKonnect (le parcours web) ---
  "ordoOblig"          boolean NOT NULL DEFAULT false,
  "examenInjecte"      boolean NOT NULL DEFAULT false,
  "listeAttenteActive" boolean NOT NULL DEFAULT false,

  "createdAt"     timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt"     timestamp with time zone NOT NULL DEFAULT NOW(),

  -- Unicité sur le code NEURACORP : c'est lui la clé du mapping. Deux centres
  -- peuvent parfaitement utiliser le même code RIS pour des examens différents.
  CONSTRAINT "KonnectExamens_userProductId_codeExamen_key"
    UNIQUE ("userProductId", "codeExamen"),

  CONSTRAINT "KonnectExamens_userProductId_fkey"
    FOREIGN KEY ("userProductId") REFERENCES "UserProduct"("id") ON DELETE CASCADE
);

CREATE INDEX "KonnectExamens_userProductId_idx"
  ON "KonnectExamens" ("userProductId");

COMMIT;
