-- Configuration des centres, exportee depuis getInitInfo.js
-- Genere le 2026-09-07 par
-- scripts/exporter-site-dashboard.js. NE PAS EDITER A LA MAIN :
-- regenerer depuis la source pour garantir l'absence d'ecart.
--
-- Ces valeurs SURCHARGENT celles du code. Tant que les deux sont
-- identiques, l'insertion ne change strictement rien au
-- comportement du robot : c'est le but, et c'est ce qui rend
-- l'operation verifiable avant de commencer a editer.
--
--   psql "$DATABASE_URL" -f <ce fichier>

\set ON_ERROR_STOP on
BEGIN;

-- 2 : 12 champs
INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
VALUES (2, 'talk.site', '{"risCode":{"info":"MZC","US":["N01","N03"],"RX":["N01","N03"],"MG":["N01","N03"],"CT":["N01","N03"],"MR":["N01","N03"]},"typeExams":{"US":"US","RX":"RX","MG":"MG","CT":"CT","MR":"MR"},"siteDetails":{"N01":{"centerName":"Neuracorp Imagerie Centre Sandbox","address":"42, rue de Neuracorp","address2":"56000 Vannes","phone":"02 99 99 99 99","website":"www.neuracorp.ai","convocationAlert":true}},"transferNumber":[{"phone":"+33661011568","label":"Sandbox","userProductId":2}],"transferOptions":{"transferForNonBookableExams":false},"strictRedirectOptions":{"strictRedirect":false,"maxDispoAttempts":3},"statePerformed":{"identification_full":false,"motif":false,"questions":false,"adultCheck":false,"menstruations":false,"organEchoConstraints":true,"siteSelection":false},"infoNewPatient":{"enabled":true,"adresse":false,"poids":false,"taille":false},"askRadiologueChoice":{"US":false,"RX":false,"MG":false,"CT":false,"MR":false},"siteSelectionList":[{"id":"N01","nom":"Vannes"},{"id":"N03","nom":"Muzillac"}],"language":"fr","languagesSupported":["fr","en","it","de","ar","ar_ma","ar_dz","ar_tn","tr","es"]}'::jsonb, 1)
ON CONFLICT ("userProductId", "domaine") DO UPDATE
  SET "valeur" = EXCLUDED."valeur",
      "version" = "ProductConfig"."version" + 1,
      "updatedAt" = NOW();

-- 8 : 14 champs
INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
VALUES (8, 'talk.site', '{"risCode":{"info":"LCR","US":["LCR","MTC"],"RX":["LCR","MTC"],"MG":["LCR","MTC"],"CT":["CRG"],"MR":["CRG"]},"typeExams":{"US":"EC","RX":"RA","MG":"MA","CT":"SC","MR":"IR"},"siteCodeToName":{"LCR":"RADIO ECHO LE CREUSOT","MTC":"RADIO ECHO MONTCHANIN","CRG":"GIE LE CREUSOT"},"siteDetails":{"MTC":{"centerName":"IMAGERIE MEDICALE Centre Montchanin","address":"5 Allée du Clos de la Poste","address2":"MONTCHANIN","phone":"03 85 69 04 54","website":"www.imageriemed.fr","mail":"sec.montchanin@imageriemed.fr","convocationAlert":false},"CRG":{"centerName":"IMAGERIE MEDICALE GIE LE CREUSOT","address":"175 RUE MARECHAL FOCH","address2":"Le Creusot","phone":"03 85 80 72 11","website":"www.imageriemed.fr","mail":"contactlecreusot@imageriemed.fr","convocationAlert":false}},"transferNumber":[{"phone":"+33385807211","label":"Le Creusot","userProductId":8}],"examTypeRedirection":{"MG":[{"phone":"+33385690454","label":"Montchanin","userProductId":9}]},"transferOptions":{"transferForNonBookableExams":true},"strictRedirectOptions":{"strictRedirect":false,"maxDispoAttempts":3},"statePerformed":{"identification_full":false,"motif":false,"questions":false,"adultCheck":true,"menstruations":true,"organEchoConstraints":true},"infoNewPatient":{"enabled":false,"adresse":false,"poids":false,"taille":false},"askRadiologueChoice":{"US":false,"RX":false,"MG":false,"CT":false,"MR":false},"rdvInstructionSentence":"pensez bien à amener votre ordonnance, la carte vitale et une pièce d''identité, et si besoin vos justificatif ALD et arrêt de travail.","language":"fr","languagesSupported":["fr"]}'::jsonb, 1)
ON CONFLICT ("userProductId", "domaine") DO UPDATE
  SET "valeur" = EXCLUDED."valeur",
      "version" = "ProductConfig"."version" + 1,
      "updatedAt" = NOW();

-- 9 : 14 champs
INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
VALUES (9, 'talk.site', '{"risCode":{"info":"MTC","US":["MTC","LCR"],"RX":["MTC","LCR"],"MG":["MTC"],"CT":[],"MR":[]},"typeExams":{"US":"EC","RX":"RA","MG":"MA","CT":"SC","MR":"IR"},"siteCodeToName":{"MTC":"RADIO ECHO MONTCHANIN","LCR":"RADIO ECHO LE CREUSOT"},"siteDetails":{"LCR":{"centerName":"IMAGERIE MEDICALE Centre Le Creusot","address":"175 rue Maréchal Foch","address2":"LE CREUSOT","phone":"03 85 80 72 11","website":"www.imageriemed.fr","mail":"contactlecreusot@imageriemed.fr","convocationAlert":false}},"transferNumber":[{"phone":"+33385690454","label":"Montchanin","userProductId":9},{"phone":"+33385807211","label":"Le Creusot","userProductId":8}],"examTypeRedirection":{"MR":[{"phone":"+33385807211","label":"Le Creusot","userProductId":8}],"CT":[{"phone":"+33385807211","label":"Le Creusot","userProductId":8}]},"transferOptions":{"transferForNonBookableExams":true},"strictRedirectOptions":{"strictRedirect":false,"maxDispoAttempts":3},"statePerformed":{"identification_full":false,"motif":false,"questions":false,"adultCheck":true,"menstruations":true,"organEchoConstraints":true},"infoNewPatient":{"enabled":false,"adresse":false,"poids":false,"taille":false},"askRadiologueChoice":{"US":false,"RX":false,"MG":false,"CT":false,"MR":false},"rdvInstructionSentence":"pensez bien à amener votre ordonnance, la carte vitale et une pièce d''identité, et si besoin vos justificatif ALD et arrêt de travail.","language":"fr","languagesSupported":["fr"]}'::jsonb, 1)
ON CONFLICT ("userProductId", "domaine") DO UPDATE
  SET "valeur" = EXCLUDED."valeur",
      "version" = "ProductConfig"."version" + 1,
      "updatedAt" = NOW();

-- 10 : 11 champs
INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
VALUES (10, 'talk.site', '{"risCode":{"info":"CAB","US":["CAB","PVS"],"RX":["CAB","PVS"],"MG":["CAB","PVS"],"CT":["PVS"],"MR":[]},"typeExams":{"US":"EC","RX":"RA","MG":"MA","CT":"SC","MR":"IR"},"siteCodeToName":{"CAB":"IMM CLOS MALCUS MACON","PVS":"IMM POLYCLINIQUE MACON"},"transferNumber":[{"phone":"+333","label":"IMM Macon","userProductId":10}],"transferOptions":{"transferForNonBookableExams":true},"strictRedirectOptions":{"strictRedirect":false,"maxDispoAttempts":3},"statePerformed":{"identification_full":true,"motif":true,"questions":true,"adultCheck":false,"menstruations":true,"organEchoConstraints":false},"infoNewPatient":{"enabled":false,"adresse":false,"poids":false,"taille":false},"askRadiologueChoice":{"US":false,"RX":false,"MG":false,"CT":false,"MR":false},"language":"fr","languagesSupported":["fr"]}'::jsonb, 1)
ON CONFLICT ("userProductId", "domaine") DO UPDATE
  SET "valeur" = EXCLUDED."valeur",
      "version" = "ProductConfig"."version" + 1,
      "updatedAt" = NOW();

-- 11 : 11 champs
INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
VALUES (11, 'talk.site', '{"risCode":{"info":"CM","US":[],"RX":[],"MG":[],"CT":["PVS"],"MR":["CM","CH"]},"typeExams":{"US":"EC","RX":"RA","MG":"MA","CT":"SC","MR":"IR"},"siteCodeToName":{"CM":"GIE IRM CLOS MALCUS MACON","PVS":"IMM POLYCLINIQUE MACON","CH":"GIE IRM CENTRE HOSPITALIER MACON"},"transferNumber":[{"phone":"+333","label":"GIE IRM Macon","userProductId":11}],"transferOptions":{"transferForNonBookableExams":true},"strictRedirectOptions":{"strictRedirect":false,"maxDispoAttempts":3},"statePerformed":{"identification_full":true,"motif":true,"questions":true,"adultCheck":false,"menstruations":true,"organEchoConstraints":false},"infoNewPatient":{"enabled":false,"adresse":false,"poids":false,"taille":false},"askRadiologueChoice":{"US":false,"RX":false,"MG":false,"CT":false,"MR":false},"language":"fr","languagesSupported":["fr"]}'::jsonb, 1)
ON CONFLICT ("userProductId", "domaine") DO UPDATE
  SET "valeur" = EXCLUDED."valeur",
      "version" = "ProductConfig"."version" + 1,
      "updatedAt" = NOW();

-- 12 : 13 champs
INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
VALUES (12, 'talk.site', '{"risCode":{"info":"A04","US":["A04"],"RX":["A04"],"MG":["A04"],"CT":["A05"],"MR":["A05"]},"typeExams":{"US":"EC","RX":"RA","MG":"MA","CT":"SC","MR":"IR","PA":"PA"},"siteCodeToName":{"A04":"Imagerie Médicale Cognac"},"transferNumber":[{"phone":"+33586870092","label":"Cognac","userProductId":12}],"examTypeRedirection":{"MR":[{"phone":"+33545356891","label":"Centre IRM Cognac","userProductId":12}],"CT":[{"phone":"+33545356891","label":"Centre Scanner Cognac","userProductId":12}]},"transferFallbacks":[{"days":[6],"startHour":8,"startMinute":0,"endHour":12,"endMinute":0,"phone":"+33545356891","label":"Centre Cognac"}],"transferOptions":{"transferForNonBookableExams":true},"strictRedirectOptions":{"strictRedirect":false,"maxDispoAttempts":3},"statePerformed":{"identification_full":false,"motif":false,"questions":false,"adultCheck":false,"menstruations":false,"organEchoConstraints":true},"infoNewPatient":{"enabled":false,"adresse":false,"poids":false,"taille":false},"askRadiologueChoice":{"US":false,"RX":false,"MG":false,"CT":false,"MR":false},"language":"fr","languagesSupported":["fr"]}'::jsonb, 1)
ON CONFLICT ("userProductId", "domaine") DO UPDATE
  SET "valeur" = EXCLUDED."valeur",
      "version" = "ProductConfig"."version" + 1,
      "updatedAt" = NOW();

-- 13 : 13 champs
INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
VALUES (13, 'talk.site', '{"risCode":{"info":"CLI","US":["CLI","LAU","EPS","GAR","MIS","DRA"],"RX":["CLI","LAU","EPS","GAR","MIS","DRA"],"MG":["CLI","LAU","EPS","MIS","DRA"],"CT":["CLI"],"MR":["CLI"]},"typeExams":{"US":"EC","RX":"RA","MG":"MA","CT":"SC","MR":"IR"},"siteCodeToName":{"CLI":"Centre Imagerie LE CLIPPER","LAU":"Centre Imagerie Les Lauriers","EPS":"Centre Imagerie Epsilon 3","GAR":"Centre Imagerie de la Gare","MIS":"Centre Imagerie Le Mistral","DRA":"Centre Imagerie Draguignan"},"siteDetails":{"LAU":{"centerName":"Cabinet de radiologie Les Lauriers","address":"147 Rue Jean Giono","address2":"FREJUS","phone":"04 94 51 81 81","website":"www.varimev.fr","mail":"radio@varimev.fr","convocationAlert":false},"EPS":{"centerName":"Cabinet de radiologie Epsilon 3","address":"87 avenue Archimède Epsilon 3 Batiment A","address2":"SAINT RAPHAEL","phone":"04 94 19 95 95","website":"www.varimev.fr","mail":"epsilon@varimev.fr","convocationAlert":false},"GAR":{"centerName":"Cabinet de radiologie de la Gare","address":"123 Rue Waldeck Rousseau","address2":"SAINT RAPHAEL","phone":"04 94 83 86 11","website":"www.varimev.fr","mail":"radio@varimev.fr","convocationAlert":false},"MIS":{"centerName":"Cabinet de radiologie le Mistral","address":"13 Boulevard Frederic Mistral","address2":"SAINT MAXIME","phone":"04 94 55 72 72","website":"www.varimev.fr","mail":"mistral@varimev.fr","convocationAlert":false},"DRA":{"centerName":"Cabinet de radiologie Le France Draguignan","address":"8 avenue des Vignerons","address2":"DRAGUIGNAN","phone":"04 94 68 09 67","website":"www.varimev.fr","mail":"cimlefrance@varimev.fr","convocationAlert":false}},"transferNumber":[{"phone":"+33494518902","label":"Le Clipper","userProductId":13}],"transferOptions":{"transferForNonBookableExams":true},"strictRedirectOptions":{"strictRedirect":false,"maxDispoAttempts":3},"statePerformed":{"identification_full":false,"motif":true,"questions":false,"adultCheck":false,"menstruations":false,"organEchoConstraints":true},"infoNewPatient":{"enabled":false,"adresse":false,"poids":false,"taille":false},"askRadiologueChoice":{"US":false,"RX":false,"MG":true,"CT":false,"MR":false},"rdvInstructionSentence":"pensez à venir quinze minutes avant votre examen avec votre ordonnance, votre carte vitale et une pièce d''identité, et si besoin vos justificatifs ALD et arrêt de travail.","language":"fr","languagesSupported":["fr"]}'::jsonb, 1)
ON CONFLICT ("userProductId", "domaine") DO UPDATE
  SET "valeur" = EXCLUDED."valeur",
      "version" = "ProductConfig"."version" + 1,
      "updatedAt" = NOW();

-- 14 : 13 champs
INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
VALUES (14, 'talk.site', '{"risCode":{"info":"EPS","US":["EPS","CLI","LAU","GAR","MIS","DRA"],"RX":["EPS","CLI","LAU","GAR","MIS","DRA"],"MG":["EPS","CLI","LAU","MIS","DRA"],"CT":["EPS"],"MR":["EPS"]},"typeExams":{"US":"EC","RX":"RA","MG":"MA","CT":"SC","MR":"IR"},"siteCodeToName":{"EPS":"Centre Imagerie Epsilon 3","CLI":"Centre Imagerie LE CLIPPER","LAU":"Centre Imagerie Les Lauriers","GAR":"Centre Imagerie de la Gare","MIS":"Centre Imagerie Le Mistral","DRA":"Centre Imagerie Draguignan"},"siteDetails":{"CLI":{"centerName":"Cabinet de radiologie Le Clipper","address":"375 Avenue du maréchal de Lattre de Tassigny","address2":"FREJUS","phone":"04 94 51 89 00","website":"www.varimev.fr","mail":"clipper@varimev.fr","convocationAlert":false},"LAU":{"centerName":"Cabinet de radiologie Les Lauriers","address":"147 Rue Jean Giono","address2":"FREJUS","phone":"04 94 51 81 81","website":"www.varimev.fr","mail":"radio@varimev.fr","convocationAlert":false},"GAR":{"centerName":"Cabinet de radiologie de la Gare","address":"123 Rue Waldeck Rousseau","address2":"SAINT RAPHAEL","phone":"04 94 83 86 11","website":"www.varimev.fr","mail":"radio@varimev.fr","convocationAlert":false},"MIS":{"centerName":"Cabinet de radiologie le Mistral","address":"13 Boulevard Frederic Mistral","address2":"SAINT MAXIME","phone":"04 94 55 72 72","website":"www.varimev.fr","mail":"mistral@varimev.fr","convocationAlert":false},"DRA":{"centerName":"Cabinet de radiologie Le France Draguignan","address":"8 avenue des Vignerons","address2":"DRAGUIGNAN","phone":"04 94 68 09 67","website":"www.varimev.fr","mail":"cimlefrance@varimev.fr","convocationAlert":false}},"transferNumber":[{"phone":"+33494199591","label":"Epsilon","userProductId":14}],"transferOptions":{"transferForNonBookableExams":true},"strictRedirectOptions":{"strictRedirect":false,"maxDispoAttempts":3},"statePerformed":{"identification_full":false,"motif":true,"questions":false,"adultCheck":false,"menstruations":false,"organEchoConstraints":true},"infoNewPatient":{"enabled":false,"adresse":false,"poids":false,"taille":false},"askRadiologueChoice":{"US":false,"RX":false,"MG":true,"CT":false,"MR":false},"rdvInstructionSentence":"pensez à venir quinze minutes avant votre examen avec votre ordonnance, votre carte vitale et une pièce d''identité, et si besoin vos justificatifs ALD et arrêt de travail.","language":"fr","languagesSupported":["fr"]}'::jsonb, 1)
ON CONFLICT ("userProductId", "domaine") DO UPDATE
  SET "valeur" = EXCLUDED."valeur",
      "version" = "ProductConfig"."version" + 1,
      "updatedAt" = NOW();

-- 15 : 14 champs
INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
VALUES (15, 'talk.site', '{"risCode":{"info":"MEN","US":["MEN"],"RX":["MEN"],"MG":["MEN"],"CT":["MEN"],"MR":["MEN"]},"typeExams":{"US":"US","UI":"UI","RX":"RX","MG":"SE","CT":"CT","CI":"CI","MR":"MR"},"siteCodeToName":{"MEN":"CH Menton"},"transferNumber":[{"phone":"+33493287608","label":"CH Menton","userProductId":15}],"transferOptions":{"transferForNonBookableExams":true},"strictRedirectOptions":{"strictRedirect":false,"maxDispoAttempts":3},"statePerformed":{"identification_full":false,"motif":true,"questions":true,"adultCheck":false,"menstruations":false,"organEchoConstraints":true,"phoneLookupEnabled":false},"infoNewPatient":{"enabled":false,"adresse":false,"poids":false,"taille":false},"askRadiologueChoice":{"US":false,"RX":false,"MG":false,"CT":false,"MR":false},"specialMedecins":{"enabled":true,"codesMedecins":["BENATE"],"doctorName":"BENATTAR","sentence":"special_medecin_warning"},"language":"fr","languagesSupported":["fr","it","en"],"sttHints":["fr"],"askLanguageList":["fr","en","it"]}'::jsonb, 1)
ON CONFLICT ("userProductId", "domaine") DO UPDATE
  SET "valeur" = EXCLUDED."valeur",
      "version" = "ProductConfig"."version" + 1,
      "updatedAt" = NOW();

-- 18 : 12 champs
INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
VALUES (18, 'talk.site', '{"risCode":{"info":"PQS","RX":["PQS","FOU","PLA"],"US":["PQS","FOU","PLA"],"MG":["PQS","FOU","PLA"],"OT":["PQS","FOU","PLA"]},"typeExams":{"US":"US","RX":"DX","MG":"MG","OT":"OT"},"siteCodeToName":{"PQS":"Centre Quimper","FOU":"Centre de Fouesnant","PLA":"Centre Pont l''Abbé"},"siteDetails":{"FOU":{"centerName":"Centre de Fouesnant","address":"27 Hent Kergador","address2":"29170 Fouesnant","phone":"0606060606","website":"www.rim29sud.fr","mail":"contact@29sud.fr","convocationAlert":false},"PLA":{"centerName":"Centre Pont l''Abbé","address":"11 Park ar Stankou","address2":"29120 Pont-l''Abbé","phone":"0606060606","website":"www.rim29sud.fr","mail":"contact@29sud.fr","convocationAlert":false}},"transferNumber":[{"phone":"0606060606","label":"Quimper","userProductId":18}],"transferOptions":{"transferForNonBookableExams":true},"strictRedirectOptions":{"strictRedirect":false,"maxDispoAttempts":3},"statePerformed":{"identification_full":false,"motif":false,"questions":false,"adultCheck":false,"menstruations":false,"organEchoConstraints":true,"siteSelection":true},"infoNewPatient":{"enabled":false,"adresse":false,"poids":false,"taille":false},"siteSelectionList":[{"id":"PQS","nom":"Quimper","userProductId":18},{"id":"FOU","nom":"Fouesnant","userProductId":20},{"id":"PLA","nom":"Pont-l''Abbé","userProductId":21}],"language":"fr","languagesSupported":["fr"]}'::jsonb, 1)
ON CONFLICT ("userProductId", "domaine") DO UPDATE
  SET "valeur" = EXCLUDED."valeur",
      "version" = "ProductConfig"."version" + 1,
      "updatedAt" = NOW();

-- 20 : 11 champs
INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
VALUES (20, 'talk.site', '{"risCode":{"info":"FOU","RX":["PQS","FOU","PLA"],"US":["PQS","FOU","PLA"],"MG":["PQS","FOU","PLA"],"OT":["PQS","FOU","PLA"]},"typeExams":{"US":"US","RX":"DX","MG":"MG","OT":"OT"},"siteCodeToName":{"FOU":"Centre de Fouesnant","PQS":"Centre Quimper","PLA":"Centre Pont l''Abbé"},"siteDetails":{"PQS":{"centerName":"Centre Quimper","address":"11 chemin de Penhoat","address2":"29000 Quimper","phone":"0606060606","website":"www.rim29sud.fr","mail":"contact@29sud.fr","convocationAlert":false},"PLA":{"centerName":"Centre Pont l''Abbé","address":"11 Park ar Stankou","address2":"29120 Pont-l''Abbé","phone":"0606060606","website":"www.rim29sud.fr","mail":"contact@29sud.fr","convocationAlert":false}},"transferNumber":[{"phone":"0606060606","label":"Fouesnant","userProductId":20}],"transferOptions":{"transferForNonBookableExams":true},"strictRedirectOptions":{"strictRedirect":false,"maxDispoAttempts":3},"statePerformed":{"identification_full":false,"motif":false,"questions":false,"adultCheck":false,"menstruations":false,"organEchoConstraints":true,"siteSelection":true},"infoNewPatient":{"enabled":false,"adresse":false,"poids":false,"taille":false},"language":"fr","languagesSupported":["fr"]}'::jsonb, 1)
ON CONFLICT ("userProductId", "domaine") DO UPDATE
  SET "valeur" = EXCLUDED."valeur",
      "version" = "ProductConfig"."version" + 1,
      "updatedAt" = NOW();

-- 21 : 11 champs
INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
VALUES (21, 'talk.site', '{"risCode":{"info":"PLA","RX":["PQS","FOU","PLA"],"US":["PQS","FOU","PLA"],"MG":["PQS","FOU","PLA"],"OT":["PQS","FOU","PLA"]},"typeExams":{"US":"US","RX":"DX","MG":"MG","OT":"OT"},"siteCodeToName":{"PLA":"Centre Pont l''Abbé","PQS":"Centre Quimper","FOU":"Centre de Fouesnant"},"siteDetails":{"PQS":{"centerName":"Centre Quimper","address":"11 chemin de Penhoat","address2":"29000 Quimper","phone":"0606060606","website":"www.rim29sud.fr","mail":"contact@29sud.fr","convocationAlert":false},"FOU":{"centerName":"Centre de Fouesnant","address":"27 Hent Kergador","address2":"29170 Fouesnant","phone":"0606060606","website":"www.rim29sud.fr","mail":"contact@29sud.fr","convocationAlert":false}},"transferNumber":[{"phone":"0606060606","label":"Pont-l''Abbé","userProductId":21}],"transferOptions":{"transferForNonBookableExams":true},"strictRedirectOptions":{"strictRedirect":false,"maxDispoAttempts":3},"statePerformed":{"identification_full":false,"motif":false,"questions":false,"adultCheck":false,"menstruations":false,"organEchoConstraints":true,"siteSelection":true},"infoNewPatient":{"enabled":false,"adresse":false,"poids":false,"taille":false},"language":"fr","languagesSupported":["fr"]}'::jsonb, 1)
ON CONFLICT ("userProductId", "domaine") DO UPDATE
  SET "valeur" = EXCLUDED."valeur",
      "version" = "ProductConfig"."version" + 1,
      "updatedAt" = NOW();

-- 22 : 10 champs
INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
VALUES (22, 'talk.site', '{"risCode":{"info":"PON","RX":["PON"],"US":["PON"],"MG":["PON"],"OT":["PON"]},"typeExams":{"US":"US","RX":"DX","MG":"MG","OT":"OT"},"siteCodeToName":{"PON":"Centre Pontivy"},"transferNumber":[{"phone":"0606060606","label":"Pontivy","userProductId":22}],"transferOptions":{"transferForNonBookableExams":true},"strictRedirectOptions":{"strictRedirect":false,"maxDispoAttempts":3},"statePerformed":{"identification_full":false,"motif":true,"questions":false,"adultCheck":false,"menstruations":false,"organEchoConstraints":true},"infoNewPatient":{"enabled":false,"adresse":false,"poids":false,"taille":false},"language":"fr","languagesSupported":["fr"]}'::jsonb, 1)
ON CONFLICT ("userProductId", "domaine") DO UPDATE
  SET "valeur" = EXCLUDED."valeur",
      "version" = "ProductConfig"."version" + 1,
      "updatedAt" = NOW();

COMMIT;

-- Controle : un centre par ligne, et le nombre de champs poses.
SELECT "userProductId",
       "version",
       (SELECT count(*) FROM jsonb_object_keys("valeur")) AS champs
  FROM "ProductConfig"
 WHERE "domaine" = 'talk.site'
 ORDER BY "userProductId";
