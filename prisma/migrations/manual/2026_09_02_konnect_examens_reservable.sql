-- Migration manuelle : le mapping devient le seul lieu du choix de chemin
--
-- Chantier `plans/2026-09-konnect-deux-chemins.md`, lot 1.
--
-- Il ne reste que DEUX chemins pour une demande de rendez-vous :
--   reservation de bout en bout  le patient choisit son creneau, le RDV est pose ;
--   rappel                       aucun creneau, on lui propose de laisser son
--                                numero, sinon on lui affiche celui du centre.
--
-- Le troisieme chemin (`relecture` : RDV pose puis relu a posteriori) disparait,
-- et avec lui l'ecran « Modes de traitement », sa route et sa table. Le choix se
-- fait desormais ligne par ligne dans le mapping d'examens, avec deux cases qui
-- ne disent PAS la meme chose :
--
--   "performed"          le centre pratique cet examen et le portail le reconnait ;
--   "reservableEnLigne"  parmi ceux-la, ceux que le patient reserve seul.
--
-- DEFAUT `true`, ET IL NE FAUT PAS L'INVERSER. Une colonne a `false` par defaut
-- basculerait d'un coup tout le catalogue d'un centre en rappel, en silence.
-- C'est le meme raisonnement que l'absence de ligne dans "KonnectModesTraitement",
-- qui valait `autonome`.
--
-- CE QUI DEPEND DE CETTE COLONNE, cote portail : l'aiguillage avant le choix de
-- creneau. Decochee, le patient ne voit aucune date.
--
-- Idempotent : sur a rejouer.

BEGIN;

-- --- 1. La nouvelle colonne -------------------------------------------------

ALTER TABLE "KonnectExamens"
  ADD COLUMN IF NOT EXISTS "reservableEnLigne" boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN "KonnectExamens"."reservableEnLigne" IS
  'Le patient reserve seul son creneau. Decoche : aucun creneau propose, on lui offre d''etre rappele.';

-- --- 2. Reprise de ce qui etait regle dans « Modes de traitement » -----------
--
-- On ne perd aucun reglage deja saisi :
--   portee = 'examen',  mode = 'orientation_directe'  -> l'examen passe en rappel ;
--   portee = 'famille', mode = 'orientation_directe'  -> toute la famille passe en rappel ;
--   mode = 'relecture'                                -> ignore, retour a la reservation
--                                                        autonome (le chemin disparait) ;
--   mode = 'autonome'                                 -> deja le defaut, rien a faire.
--
-- La famille se lit sur le type d'examen, le type client primant sur le type
-- NEURACORP, exactement comme l'ecran l'affiche. Correspondance des familles vers
-- les codes de modalite : irm -> MR, scanner -> CT, radio -> RX, echo -> US ;
-- « autre » couvre tout le reste (MG, USMAM, et les lignes sans type).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'KonnectModesTraitement'
  ) THEN

    -- Exceptions par examen : la cle EST le code RIS du centre.
    UPDATE "KonnectExamens" e
       SET "reservableEnLigne" = false,
           "updatedAt"         = NOW()
      FROM "KonnectModesTraitement" m
     WHERE m."userProductId" = e."userProductId"
       AND m."portee"        = 'examen'
       AND m."mode"          = 'orientation_directe'
       AND trim(m."cle")     = trim(e."codeExamenClient")
       AND trim(e."codeExamenClient") <> '';

    -- Reglages par famille. Une exception par examen a deja ete posee ci-dessus ;
    -- elle prime, mais comme les deux vont dans le meme sens (false), l'ordre est
    -- sans consequence.
    UPDATE "KonnectExamens" e
       SET "reservableEnLigne" = false,
           "updatedAt"         = NOW()
      FROM "KonnectModesTraitement" m
     WHERE m."userProductId" = e."userProductId"
       AND m."portee"        = 'famille'
       AND m."mode"          = 'orientation_directe'
       AND (
         (m."cle" = 'irm'     AND COALESCE(NULLIF(trim(e."typeExamenClient"), ''), e."typeExamen") = 'MR')
         OR (m."cle" = 'scanner' AND COALESCE(NULLIF(trim(e."typeExamenClient"), ''), e."typeExamen") = 'CT')
         OR (m."cle" = 'radio'   AND COALESCE(NULLIF(trim(e."typeExamenClient"), ''), e."typeExamen") = 'RX')
         OR (m."cle" = 'echo'    AND COALESCE(NULLIF(trim(e."typeExamenClient"), ''), e."typeExamen") = 'US')
         OR (m."cle" = 'autre'   AND COALESCE(
               COALESCE(NULLIF(trim(e."typeExamenClient"), ''), e."typeExamen"), ''
             ) NOT IN ('MR', 'CT', 'RX', 'US'))
       );

  END IF;
END $$;

-- --- 3. La table des modes n'a plus de raison d'etre ------------------------
--
-- Son contenu vient d'etre repris ci-dessus. L'ecran, la route et le module
-- `app/modes` de Konnect partent dans le meme chantier.

DROP TABLE IF EXISTS "KonnectModesTraitement";

COMMIT;
