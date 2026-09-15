-- Reprise des comptes secretaire : du booleen herite vers des permissions ecrites.
--
-- CONTEXTE
-- --------
-- `User.isSecretary` est un booleen qui declenche, dans `hasPermission`, une branche
-- heritee : lecture seule sur les pages de configuration, ecriture partout ailleurs.
--
-- Le probleme n'est pas le resultat, il est juste. C'est la REGLE IMPLICITE : elle
-- s'applique a toute page, y compris a celles qui n'existent pas encore. Le 14/09/2026,
-- declarer les treize pages de LyraeKonnect aurait donc accorde l'ecriture sur toute la
-- configuration du portail a chaque compte secretaire, en silence, au premier
-- deploiement. Il a fallu ajouter ces pages a `SECRETARY_READONLY_PAGES` pour l'eviter,
-- et ce reflexe ne se reproduira pas tout seul au prochain produit.
--
-- Des permissions ECRITES ne bougent pas quand le catalogue de pages grandit. C'est tout
-- l'objet de cette reprise.
--
-- CE QUE FAIT CE SCRIPT
-- ---------------------
-- Il pose le JSON de permissions equivalent au prereglage, sur les comptes secretaire
-- qui n'en ont pas encore. `presetSecretaire()` (src/lib/permissions.ts) produit
-- exactement le meme objet pour les comptes crees depuis le 15/09/2026.
--
-- AVANT DE LANCER
-- ---------------
--   1. Passer d'abord le bloc de CONTROLE ci-dessous, et lire son resultat.
--   2. Ce script ne touche QUE les comptes `isSecretary = true` ET `permissions IS NULL`.
--      Un compte a qui un administrateur a deja donne des droits sur mesure n'est jamais
--      ecrase : c'est la condition qui rend le script rejouable sans risque.
--   3. Il ne retire PAS `isSecretary`. La branche heritee reste en place tant que tous
--      les comptes ne sont pas repris ; la retirer se fera dans un second temps, quand
--      le controle final rendra zero.
--
-- \pset pager off  -- sinon un resultat long s'ouvre dans `less` et se lit comme vide

-- ---------------------------------------------------------------- CONTROLE (avant)
-- Combien de comptes sont concernes, et lesquels ?
SELECT u."id", u."name", u."email", u."role", u."isSecretary",
       (u."permissions" IS NULL) AS sans_permissions
  FROM "User" u
 WHERE u."isSecretary" = true
 ORDER BY u."id";

-- ---------------------------------------------------------------- REPRISE
-- Les pages en LECTURE SEULE pour une secretaire : celles qui reglent la configuration
-- d'un centre. Doit rester le miroir de `SECRETARY_READONLY_PAGES`
-- (src/lib/permissions.ts) : si l'une des deux listes change, l'autre suit.
UPDATE "User" u
   SET "permissions" = jsonb_build_object(
         -- LyraeTalk, lecture seule
         'parametrage',      'read',
         'mapping_exam',     'read',
         'questions_exam',   'read',
         'planning_complet', 'read',
         'informationnel',   'read',
         -- LyraeTalk, ecriture
         'dashboard',        'write',
         'ordonnances',      'write',
         'calls',            'write',
         'stats',            'write',
         'stats_appel',      'write',
         'stats_no_show',    'write',
         'incidents',        'write',
         -- LyraeKonnect, lecture seule : c'est de la configuration
         'konnect_parametrage',        'read',
         'konnect_examens',            'read',
         'konnect_sites',              'read',
         'konnect_entonnoir',          'read',
         'konnect_regles_fusion',      'read',
         'konnect_regles_coexistence', 'read',
         'konnect_creneaux',           'read',
         'konnect_paires',             'read',
         'konnect_mots',               'read',
         'konnect_regles_cliniques',   'read',
         -- LyraeKonnect, ecriture : marquer un patient comme rappele est du travail
         -- de secretariat, pas de la configuration.
         'konnect_dashboard',       'write',
         'konnect_demandes_rappel', 'write',
         'konnect_stats',           'write',
         -- Transverse
         'tickets', 'write'
       )
 WHERE u."isSecretary" = true
   AND u."permissions" IS NULL;

-- ---------------------------------------------------------------- CONTROLE (apres)
-- Doit rendre 0. Tant que ce n'est pas le cas, ne pas retirer la branche heritee de
-- `hasPermission` : des comptes en dependent encore.
SELECT count(*) AS comptes_secretaire_sans_permissions
  FROM "User"
 WHERE "isSecretary" = true
   AND "permissions" IS NULL;
