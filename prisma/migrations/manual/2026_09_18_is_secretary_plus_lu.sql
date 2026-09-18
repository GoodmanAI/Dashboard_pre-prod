-- Migration manuelle : le booleen "User"."isSecretary" n'est plus lu
--
-- POURQUOI. Ce booleen donnait un profil implicite (lecture seule sur la
-- configuration, ecriture ailleurs) aux comptes CLIENT sans JSON `permissions`.
-- Regle implicite, donc dangereuse : elle s'appliquait a toute page, y compris
-- celles qui n'existaient pas quand elle a ete ecrite (piege du 14/09/2026, ou
-- declarer les pages Konnect aurait donne l'ecriture a chaque compte secretaire).
-- Depuis le 15/09/2026 un compte secretaire porte le prereglage en clair
-- (`presetSecretaire()`), et depuis le 18/09/2026 `hasPermission` ne lit plus le
-- booleen.
--
-- CE QUE CETTE MIGRATION FAIT : RIEN, SAUF REFUSER. Un compte CLIENT flagge sans
-- `permissions` etait restreint par le booleen. Le code deploye apres cette
-- migration le traiterait comme un compte principal, a ACCES COMPLET. Elle leve
-- donc une erreur s'il en reste un, pour que le deploiement s'arrete AVANT le code.
-- Constate le 18/09/2026 : 2 comptes flagges, tous deux avec le prereglage, 0 sans.
--
-- La colonne reste en base : pas de migration destructive, et la page
-- « Utilisateurs » de l'administration continue de signaler cet etat.
--
-- A PASSER AVANT LE CODE. Idempotente, sans ecriture.

DO $$
DECLARE
  restants integer;
BEGIN
  SELECT count(*) INTO restants
  FROM "User"
  WHERE "isSecretary" AND role = 'CLIENT' AND permissions IS NULL;
  IF restants > 0 THEN
    RAISE EXCEPTION
      '% compte(s) isSecretary sans permissions : leur poser le prereglage secretaire AVANT de deployer, sinon ils obtiennent un acces complet.',
      restants;
  END IF;
END $$;

-- Verif :
--   SELECT id, role, permissions IS NULL AS sans_permissions FROM "User" WHERE "isSecretary";
