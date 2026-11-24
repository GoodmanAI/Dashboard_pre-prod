# LYRAE PILOT : architecture cible

Rédigée le 26/10/2026 à partir de `BRIEF-AMELIORATION.md`,
`PROPOSITIONS-AMELIORATION.md` et des sept réponses données le même jour.
Elle décrit le produit complet (lots 1 bis, 2 et 3), le modèle de données, les
modules, les routes, les écrans, les traitements périodiques, les algorithmes,
les tests et l'ordre de livraison. Rien n'est codé.

Les règles du dossier produit et de `CLAUDE.md` restent entières : aucune donnée
patient, Pilot lit le Dashboard et ne l'écrit jamais, une étape automatique ne
se coche pas à la main, les énumérations ne se renomment pas, l'argent est en
centimes entiers, aucune donnée patient dans les logs, rien ne part sur GitHub.

---

## 1. Décisions prises le 26/10/2026

| Question | Réponse | Conséquence d'architecture |
|---|---|---|
| Q1 Modèle tarifaire | **Pas encore fixé** | `CrmLigneContrat` reste générique (forfait ou usage, par site ou par organisation). Le moteur de projection est agnostique. L'export comptable est livré mais marqué « à valider » tant que le modèle n'est pas tranché. C'est ce qui lève l'incohérence lot 2 / lot 3 : les écrans de CA se construisent, la confiance comptable attend. |
| Q2 Tiers qui bloquent | EDL, opérateur téléphonique, prestataire web du client, le client | Enum `CrmTiers` = LYRAE, CLIENT, EDL, OPERATEUR_TELEPHONIE, PRESTATAIRE_SITE_WEB, AUTRE. Additive. |
| Q3 Négociation | Plusieurs versions de devis | Tables `CrmProposition` et `CrmLigneProposition`, versionnées. L'acceptation crée le contrat. |
| Q4 Responsables | Deux | `responsableId` (commercial, existant) et `chefDeProjetId` (nouveau, optionnel). |
| Q5 Multi-sites | Vagues optionnelles | Table `CrmVague` avec date promise par vague. `CrmCentreProduit.vagueId` optionnel. |
| Q6 Historique | Import CSV minimal | Script `scripts/import-csv.ts`, idempotent par clé d'import. Pas d'écran. |
| Q7 Seuils | Estimations puis mesure | Seuils dans le code. Le journal d'événements mesure le réel. Révision après trois mois. |

---

## 2. Principes

1. **Chaque écran se termine par une action.** Une ligne affichée sans bouton
   « faire », « replanifier », « relancer » ou « acquitter » est une ligne
   incomplète.
2. **Ce qui dépend de l'heure se calcule à la lecture ; ce qui est une décision
   humaine se stocke.** Les alertes, la date réaliste, le vieillissement se
   calculent. Les acquittements, les attentes déclarées, les propositions se
   stockent.
3. **Une seule implémentation par calcul.** Le moteur de projection, le calcul
   d'alertes et la différence d'évaluation sont des fonctions pures, appelées
   par le serveur, par le navigateur quand il le faut, et par les tests.
4. **Toute mutation journalise.** Une route qui écrit sans appeler
   `journaliser()` est un défaut.
5. **Les gardes vivent côté serveur**, dans `src/lib`, jamais seulement dans un
   composant. Les routes sont minces : validation Zod, session, appel du
   service, réponse.
6. **Pas de nouvelle bibliothèque** hors Vitest (décision C-12 à écrire).

---

## 3. Modèle de données cible

Tout est additif. Chaque incrément livre un fichier SQL idempotent dans
`prisma/migrations/manual/` et la mise à jour correspondante de
`schema.prisma` (C-01). Les miroirs Dashboard ne bougent pas.

### 3.1 Nouvelles énumérations

```prisma
/// Qui doit agir pour qu'une étape avance. Sert aussi aux jalons d'un plan de signature.
enum CrmTiers {
  LYRAE
  CLIENT
  EDL
  OPERATEUR_TELEPHONIE
  PRESTATAIRE_SITE_WEB
  AUTRE
}

enum CrmRaisonSortie {
  PRIX
  CONCURRENT
  PAS_DE_BUDGET
  RIS_INCOMPATIBLE
  TIMING
  SANS_REPONSE
  AUTRE
}

enum CrmAttitude {
  SOUTIEN
  NEUTRE
  OPPOSANT
  INCONNU
}

enum CrmStatutEchange {
  PLANIFIE
  REALISE
  ANNULE
}

enum CrmStatutProposition {
  BROUILLON
  ENVOYEE
  EN_DISCUSSION
  ACCEPTEE
  REFUSEE
  EXPIREE
}

enum CrmCategoriePrevision {
  ENGAGE
  PROBABLE
  POSSIBLE
  EXCLU
}

enum CrmTypeEvenement {
  ORGANISATION_CREEE
  ORGANISATION_MODIFIEE
  ETAPE_COMMERCIALE_CHANGEE
  CONTACT_AJOUTE
  CONTACT_MODIFIE
  CONTACT_SUPPRIME
  CENTRE_CREE
  RATTACHEMENT_CREE
  DATE_PROMISE_CHANGEE
  ETAPE_INTEGRATION_COCHEE
  ETAPE_INTEGRATION_DECOCHEE
  ETAPE_INTEGRATION_REGRESSION
  ATTENTE_TIERS_CHANGEE
  ECHANGE_SAISI
  ECHANGE_MODIFIE
  PROCHAINE_ACTION_CHANGEE
  PROPOSITION_CREEE
  PROPOSITION_STATUT_CHANGE
  CONTRAT_CREE
  CONTRAT_MODIFIE
  OPPORTUNITE_CREEE
  OPPORTUNITE_MODIFIEE
  SCENARIO_ENREGISTRE
  ALERTE_ACQUITTEE
  CA_MENSUEL_FIGE
  IMPORT_EXECUTE
}
```

`CrmTypeEchange` reçoit trois valeurs de plus : `JALON`, `FORMATION`,
`VISITE`. Les valeurs existantes ne bougent pas.

### 3.2 Champs ajoutés aux tables existantes

**`CrmOrganisation`**

```prisma
  /// Chef de projet d'intégration. Le commercial reste `responsableId`.
  chefDeProjetId  Int?
  chefDeProjet    User? @relation("OrganisationChefDeProjet", fields: [chefDeProjetId], references: [id], onDelete: SetNull)

  /// Posé à chaque transition. Sert au vieillissement par étape.
  etapeDepuisLe   DateTime @default(now())

  /// Dénormalisés depuis le dernier échange qui en porte une. Jamais reculés
  /// par une saisie rétroactive, même règle que dernierEchangeLe.
  prochaineAction   String?
  prochaineActionLe DateTime?

  /// Code normalisé à côté du texte libre existant.
  raisonSortieCode CrmRaisonSortie?
  /// Pour EN_SOMMEIL : à cette date, une action « réveiller » apparaît.
  reveilLe         DateTime?

  /// Le client décide ici ; il démarre à demarrageAttenduLe des opportunités.
  decisionAttendueLe DateTime?
  /// Standard téléphonique, concurrent, solution maison.
  solutionActuelle   String?

  /// Qualification à cinq cases. Un signal, pas une garde.
  qualifBesoin          Boolean @default(false)
  qualifDecideur        Boolean @default(false)
  qualifBudget          Boolean @default(false)
  qualifCalendrier      Boolean @default(false)
  qualifSolutionActuelle Boolean @default(false)

  /// Clé de la ligne source lors d'un import CSV, pour rejouer sans doublon.
  importCle String? @unique

  vagues       CrmVague[]
  propositions CrmProposition[]
  evenements   CrmEvenement[]
  acquittements CrmAcquittement[]
  caMensuels   CrmCaMensuel[]

  @@index([chefDeProjetId])
  @@index([prochaineActionLe])
  @@index([reveilLe])
```

**`CrmContact`**

```prisma
  attitude         CrmAttitude @default(INCONNU)
  /// Dénormalisé depuis les échanges liés au contact.
  dernierContactLe DateTime?
```

**`CrmEchange`**

```prisma
  /// Un échange dans le futur est un rendez-vous ou un jalon.
  statut     CrmStatutEchange @default(REALISE)
  /// Pour un JALON : qui doit le franchir.
  aLaChargeDe CrmTiers?

  @@index([statut, surveneuLe])
```

**`CrmEtapeIntegration`** (étapes manuelles et mixtes seulement ; l'évaluateur
ne touche jamais ces champs, et ils ne cochent jamais la case)

```prisma
  enAttenteDe        CrmTiers?
  demandeeLe         DateTime?
  derniereRelanceLe  DateTime?
  echeanceLe         DateTime?

  @@index([enAttenteDe])
```

**`CrmCentreProduit`**

```prisma
  vagueId Int?
  vague   CrmVague? @relation(fields: [vagueId], references: [id], onDelete: SetNull)

  /// Première date promise jamais posée. Ne bouge plus. L'écart avec datePromise
  /// est le glissement cumulé.
  datePromiseInitiale   DateTime?
  /// Posé quand PASSAGE_PRODUCTION est coché.
  miseEnProductionLe    DateTime?
  /// miseEnProductionLe + 14 jours. Pendant cette période, le silence s'alerte à 24 h.
  suiviRenforceJusquAu  DateTime?
```

**`CrmContrat`**

```prisma
  engagementMois Int?
  preavisMois    Int?
  /// La proposition acceptée dont ce contrat est issu.
  propositionId  Int? @unique
  proposition    CrmProposition? @relation(fields: [propositionId], references: [id], onDelete: SetNull)
```

**`CrmOpportunite`**

```prisma
  /// Le jugement du commercial, indépendant de la probabilité mécanique.
  categoriePrevision CrmCategoriePrevision @default(POSSIBLE)
```

### 3.3 Nouvelles tables

```prisma
/// Un groupe de centres déployés ensemble. Optionnel : un client à un site n'en a pas.
model CrmVague {
  id             Int             @id @default(autoincrement())
  organisationId Int
  organisation   CrmOrganisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)
  numero         Int
  nom            String?
  datePromise    DateTime?
  rattachements  CrmCentreProduit[]
  creeLe DateTime @default(now())
  majLe  DateTime @updatedAt
  @@unique([organisationId, numero])
}

/// Une version de devis. L'acceptation crée le contrat sans ressaisie.
model CrmProposition {
  id             Int             @id @default(autoincrement())
  organisationId Int
  organisation   CrmOrganisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)
  version        Int
  statut         CrmStatutProposition @default(BROUILLON)

  envoyeeLe      DateTime?
  valideJusquAu  DateTime?
  repondueLe     DateTime?

  /// Remise globale en pour-mille, entier. 125 = 12,5 %. Jamais de flottant.
  remisePourMille Int @default(0)
  engagementMois  Int?
  preavisMois     Int?

  /// Lien vers le document, jamais le fichier.
  documentUrl    String?
  reponseClient  String?
  notes          String?

  auteurId Int?
  auteur   User? @relation("PropositionAuteur", fields: [auteurId], references: [id], onDelete: SetNull)

  lignes  CrmLigneProposition[]
  contrat CrmContrat?

  creeLe DateTime @default(now())
  majLe  DateTime @updatedAt

  @@unique([organisationId, version])
  @@index([statut, valideJusquAu])
}

/// Même forme que CrmLigneContrat : la copie à l'acceptation est champ à champ.
model CrmLigneProposition {
  id            Int            @id @default(autoincrement())
  propositionId Int
  proposition   CrmProposition @relation(fields: [propositionId], references: [id], onDelete: Cascade)
  productId     Int
  product       Product        @relation(fields: [productId], references: [id], onDelete: Cascade)
  centreId      Int?
  centre        CrmCentre?     @relation(fields: [centreId], references: [id], onDelete: SetNull)
  type          CrmTypeLigne
  montantCentimes Int @default(0)
  unite         CrmUniteVariable?
  volumeInclus  Int?
  libelle       String?
  @@index([propositionId])
}

/// Le journal. Toute mutation y écrit une ligne. Format aligné sur auditLog() du
/// Dashboard. `avant` et `apres` ne contiennent que des champs Pilot, jamais une
/// donnée patient, et jamais les champs d'un contact supprimé.
model CrmEvenement {
  id   Int              @id @default(autoincrement())
  type CrmTypeEvenement

  organisationId     Int?
  organisation       CrmOrganisation? @relation(fields: [organisationId], references: [id], onDelete: Cascade)
  centreId           Int?
  centreProduitId    Int?
  etapeIntegrationId Int?
  echangeId          Int?
  propositionId      Int?
  contratId          Int?
  opportuniteId      Int?

  /// Null = le système (évaluateur, cron, import).
  auteurId Int?
  auteur   User? @relation("EvenementAuteur", fields: [auteurId], references: [id], onDelete: SetNull)

  /// Phrase en clair, affichable telle quelle dans une chronologie.
  resume String
  avant  Json?
  apres  Json?

  surveneuLe DateTime @default(now())

  @@index([organisationId, surveneuLe])
  @@index([type, surveneuLe])
  @@index([surveneuLe])
}

/// La décision humaine de taire une alerte jusqu'à une date. L'alerte reste
/// calculée à la lecture (C-08) ; seul le silence est stocké.
model CrmAcquittement {
  id             Int             @id @default(autoincrement())
  cleAlerte      String
  organisationId Int
  organisation   CrmOrganisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)
  jusquAu        DateTime
  raison         String
  auteurId       Int?
  auteur         User? @relation("AcquittementAuteur", fields: [auteurId], references: [id], onDelete: SetNull)
  creeLe         DateTime @default(now())
  @@index([cleAlerte, jusquAu])
}

/// Le réel d'un mois, figé le 1er du mois suivant. Jamais réécrit après figeLe.
/// C'est ce que l'export comptable lit et ce à quoi un scénario se compare.
model CrmCaMensuel {
  id             Int             @id @default(autoincrement())
  /// Premier jour du mois, à minuit UTC.
  mois           DateTime
  organisationId Int
  organisation   CrmOrganisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)
  productId      Int
  product        Product         @relation(fields: [productId], references: [id], onDelete: Cascade)
  centreId       Int?

  recurrentCentimes     Int @default(0)
  variableCentimes      Int @default(0)
  miseEnServiceCentimes Int @default(0)
  /// Volume ayant servi à la part variable, pour la vérification comptable.
  volumeVariable        Int?
  uniteVariable         CrmUniteVariable?

  figeLe DateTime

  /// `${mois ISO}|${organisationId}|${productId}|${centreId ?? 0}` : une unicité
  /// qui ne dépend pas d'un NULL, PostgreSQL les considérant distincts.
  cle String @unique

  @@index([mois])
  @@index([organisationId, mois])
}
```

Relations à ajouter sur les miroirs : `User` gagne
`organisationsChefDeProjet`, `propositions`, `evenements`, `acquittements` ;
`Product` gagne `lignesProposition`, `caMensuels` ; `CrmCentre` gagne
`lignesProposition`. Ce sont des relations Prisma, pas des colonnes : les
miroirs ne changent pas en base.

### 3.4 Fichiers SQL manuels

Un fichier par incrément, tous idempotents (`IF NOT EXISTS`, `ADD COLUMN IF
NOT EXISTS`, `ALTER TYPE ... ADD VALUE IF NOT EXISTS`) :

| Fichier | Contenu |
|---|---|
| `2026_11_xx_pilot_journal.sql` | `CrmEvenement`, `CrmTypeEvenement`, `chefDeProjetId`, `etapeDepuisLe` |
| `2026_11_xx_pilot_actions.sql` | prochaine action, raison codée, réveil, qualification, attitude, statut d'échange, nouvelles valeurs de `CrmTypeEchange` |
| `2026_11_xx_pilot_attentes.sql` | `CrmTiers`, champs d'attente sur `CrmEtapeIntegration`, `CrmAcquittement` |
| `2026_11_xx_pilot_vagues.sql` | `CrmVague`, champs de `CrmCentreProduit`, `importCle` |
| `2026_12_xx_pilot_propositions.sql` | `CrmProposition`, `CrmLigneProposition`, `CrmStatutProposition`, engagement sur `CrmContrat`, `categoriePrevision` |
| `2026_12_xx_pilot_ca.sql` | `CrmCaMensuel` |

`scripts/apply-manual-migrations.js` envoie chaque fichier en une seule
requête `pg`, donc en une transaction implicite. PostgreSQL accepte
`ALTER TYPE ... ADD VALUE IF NOT EXISTS` dans une transaction, mais interdit
d'utiliser la nouvelle valeur dans la même transaction. Règle : un fichier qui
ajoute une valeur d'énumération ne l'emploie pas (pas de `DEFAULT`, pas
d'`UPDATE`) ; l'emploi va dans le fichier suivant.

---

## 4. Modules serveur

Arborescence cible de `src/lib`. Les fichiers marqués **pur** n'accèdent pas à
la base et prennent `maintenant: Date` en paramètre quand le temps compte.

```
src/lib/
  prisma.ts                       existant
  session.ts                      existant, bouchon (C-03)
  autorisations.ts                peutModifierLesMontants, peutChangerEtape, peutAcquitter
  argent.ts                       existant

  validation/                     schémas Zod partagés formulaire et route
    organisation.ts contact.ts centre.ts echange.ts etape.ts
    proposition.ts contrat.ts opportunite.ts scenario.ts acquittement.ts

  evenements/
    journaliser.ts                journaliser(tx, evenement) : écrit CrmEvenement + ligne JSON audit
    lire.ts                       chronologie d'une organisation, nouveautés depuis une date

  pipeline.ts                     existant + SEUIL_VIEILLISSEMENT, LIBELLES_RAISONS
  organisations/
    changerEtape.ts               transaction : étape, etapeDepuisLe, sortie, réveil, probas, événement
    prochaineAction.ts            recalcul dénormalisé, marquer faite, replanifier
    qualification.ts              pur : score et cases manquantes

  checklist/
    definition.ts                 existant, + documentation de l'étape mixte
    cocher.ts                     existant + journalisation + miseEnProductionLe
    diff.ts                       pur : (définitions, étatComplétude, lignes existantes) -> écritures et régressions
    evaluer.ts                    evaluerParc() par lots en une transaction ; evaluerCentre(id) ponctuel
    attentes.ts                   déclarer / relancer une attente ; liste des attentes chez les tiers

  completude/
    adapter.ts                    existant + evaluerPlusieurs(ids[]) en trois requêtes

  integration/
    dateRealiste.ts               pur
    pret.ts                       pur : « prêt » ou liste de ce qui manque
    glissement.ts                 pur : reports de date promise depuis le journal

  alertes/
    types.ts                      Alerte, NiveauAlerte, clés
    charger.ts                    une passe de requêtes : organisations, centres, étapes, états, propositions, contrats, acquittements
    calculer.ts                   pur : données -> alertes, triées, acquittées à part
    acquitter.ts                  écrit CrmAcquittement + événement
    index.ts                      calculerAlertes() = charger + calculer

  aujourdhui/
    construire.ts                 la page Aujourd'hui d'un utilisateur : actions, rendez-vous, alertes, dates promises, attentes

  propositions/
    creerVersion.ts               copie les lignes de la version précédente
    changerStatut.ts              transitions permises, expiration
    accepter.ts                   transaction : proposition -> contrat + lignes, opportunités gagnées, étape SIGNE si permise

  ca/
    projeter.ts                   pur : moteur 24 mois, trois lectures
    reel.ts                       réel d'un mois depuis les compteurs Dashboard ; figerMois()
    moisCourant.ts                le mois en cours au jour près, projeté à fin de mois
    export.ts                     CSV comptable depuis CrmCaMensuel

  parc/
    sante.ts                      quatre feux par centre en production (lot 3)

  import/
    csv.ts                        lecture, validation, upsert par importCle
  recherche.ts                    organisations, contacts, centres par préfixe
```

### 4.1 Signatures qui engagent

```ts
// evenements/journaliser.ts
export async function journaliser(
  tx: Prisma.TransactionClient,
  e: {
    type: CrmTypeEvenement;
    resume: string;
    auteurId: number | null;
    organisationId?: number;
    centreId?: number; centreProduitId?: number; etapeIntegrationId?: number;
    echangeId?: number; propositionId?: number; contratId?: number; opportuniteId?: number;
    avant?: Record<string, unknown>;
    apres?: Record<string, unknown>;
  },
): Promise<void>;
// Écrit aussi sur stdout une ligne JSON { niveau: "audit", type, organisationId,
// auteurId, resume, ts } : le format que Grafana consomme au Dashboard. Jamais
// avant/apres dans le log, qui pourraient contenir un nom de contact.

// organisations/changerEtape.ts
export async function changerEtape(p: {
  organisationId: number; vers: CrmEtapeCommerciale; auteurId: number;
  raisonSortie?: string; raisonSortieCode?: CrmRaisonSortie; reveilLe?: Date;
}): Promise<CrmOrganisation>;
// Gardes : 404, 409 transitionPermise, 400 sortie sans raison et code.
// Effets dans une transaction : etape, etapeDepuisLe = maintenant, raisonSortie*,
// reveilLe (EN_SOMMEIL seulement), probabilité des opportunités non forcées,
// événement ETAPE_COMMERCIALE_CHANGEE avec avant/apres.

// checklist/diff.ts (pur)
export function diffEtapes(p: {
  definitions: DefinitionEtape[];
  etat: EtatComplétude | null;
  existantes: CrmEtapeIntegration[];
  maintenant: Date;
}): { creations: Creation[]; misesAJour: MiseAJour[]; regressions: Regression[] };

// integration/dateRealiste.ts (pur)
export function dateRealiste(p: {
  etapes: Array<{ cle: CrmCleEtape; faite: boolean; creeLe: Date; echeanceLe: Date | null; enAttenteDe: CrmTiers | null }>;
  maintenant: Date;
}): { date: Date; resteJours: number; etapeCritique: CrmCleEtape | null };

// alertes/calculer.ts (pur)
export function calculerAlertes(donnees: DonneesAlertes, maintenant: Date): {
  actives: Alerte[]; acquittees: Alerte[];
};

// ca/projeter.ts (pur)
export function projeter(p: {
  contrats: ContratProjection[];
  opportunites: OpportuniteProjection[];
  scenario: { cochees: Set<number>; decalages: Map<number, Date> } | null;
  variableMensuelleParLigne: Map<number, number>; // centimes, moyenne des 3 derniers mois figés
  moisDepart: Date; nbMois: number; // 24
}): MoisProjete[];
// MoisProjete = { mois, signe, variable, miseEnService, pondere, optimiste } en centimes entiers.
```

---

## 5. Routes API

Toutes sous `/api/pilot`. Ordre des gardes, imposé par le Dashboard : session,
puis autorisation, puis existence, puis métier, puis journalisation. Entrées
validées par les schémas de `src/lib/validation`. Codes : 400 entrée invalide,
403 rôle insuffisant, 404 inconnu, 409 état du monde.

| Route | Méthode | Rôle minimal | Service | Événement |
|---|---|---|---|---|
| `/organisations` | POST | tous | création | ORGANISATION_CREEE |
| `/organisations/[id]` | PATCH | tous ; montants exclus | mise à jour identité, qualification, responsables, dates | ORGANISATION_MODIFIEE |
| `/organisations/[id]/etape` | PATCH | tous | `changerEtape` | ETAPE_COMMERCIALE_CHANGEE |
| `/organisations/[id]/prochaine-action` | PATCH | tous | faite ou replanifiée | PROCHAINE_ACTION_CHANGEE |
| `/contacts` | POST | tous | | CONTACT_AJOUTE |
| `/contacts/[id]` | PATCH, DELETE | tous | suppression sur demande (RGPD) : événement sans avant/apres | CONTACT_MODIFIE, CONTACT_SUPPRIME |
| `/centres` | POST | tous | | CENTRE_CREE |
| `/centres/[id]` | PATCH | tous | | ORGANISATION_MODIFIEE |
| `/rattachements` | POST | tous | centre × produit, évaluation ponctuelle ensuite | RATTACHEMENT_CREE |
| `/rattachements/[id]` | PATCH | tous | datePromise (pose datePromiseInitiale si vide), vague | DATE_PROMISE_CHANGEE |
| `/vagues` | POST, PATCH | tous | | ORGANISATION_MODIFIEE |
| `/etapes` | POST | tous | `cocherEtape` ; 409 automatique | ETAPE_INTEGRATION_COCHEE / DECOCHEE |
| `/etapes/[id]/attente` | PATCH | tous | déclarer, relancer, lever ; 409 sur étape automatique | ATTENTE_TIERS_CHANGEE |
| `/echanges` | POST | tous | existant + statut, aLaChargeDe, recalcul prochaine action | ECHANGE_SAISI |
| `/echanges/[id]` | PATCH | tous | réaliser, annuler, replanifier | ECHANGE_MODIFIE |
| `/propositions` | POST | direction, commercial | nouvelle version, lignes copiées | PROPOSITION_CREEE |
| `/propositions/[id]` | PATCH | direction, commercial | champs et lignes ; statut via transitions permises | PROPOSITION_STATUT_CHANGE |
| `/propositions/[id]/accepter` | POST | direction, commercial | `accepter` | PROPOSITION_STATUT_CHANGE, CONTRAT_CREE |
| `/contrats`, `/contrats/[id]`, `/contrats/[id]/lignes` | POST, PATCH, DELETE | direction, commercial | `peutModifierLesMontants` branché dès maintenant | CONTRAT_CREE / MODIFIE |
| `/opportunites`, `/opportunites/[id]` | POST, PATCH | direction, commercial | | OPPORTUNITE_* |
| `/scenarios`, `/scenarios/[id]` | POST, PATCH | tous | | SCENARIO_ENREGISTRE |
| `/ca/donnees` | GET | tous | entrées du moteur de projection, pour le navigateur | |
| `/ca/export.csv` | GET | direction | export comptable depuis `CrmCaMensuel`, en-tête « modèle tarifaire à valider » tant que Q1 est ouverte | |
| `/alertes` | GET | tous | actives et acquittées, filtre « à moi » | |
| `/alertes/acquitter` | POST | tous | | ALERTE_ACQUITTEE |
| `/evenements` | GET | tous | `?organisationId=&depuis=` | |
| `/recherche` | GET | tous | `?q=` | |
| `/evaluation` | POST | direction | `evaluerParc()` à la demande, le cron l'appelle aussi | |

Les routes du Dashboard refusent en 401 sans session (middleware). Aucune de ces
routes n'entre dans `PUBLIC_API_PATTERNS` : elles sont toutes appelées par un
humain connecté. Le cron appelle les services en Node, pas les routes.

---

## 6. Écrans

Tous sous `/pilot`. Coquille existante. MUI 5. Un composant client par écran
interactif, les données chargées côté serveur comme aujourd'hui.

### 6.1 `/pilot` : Aujourd'hui

Remplace la vue d'ensemble actuelle, dont les compteurs passent en bandeau
compact en haut. Pour l'utilisateur connecté, par défaut « à moi », bascule
« tout le monde ». Cinq blocs, chacun avec ses actions en ligne :

1. **Actions en retard et du jour** : organisations dont `prochaineActionLe`
   est passée ou aujourd'hui. Boutons : fait, replanifier, ouvrir.
2. **Rendez-vous** : échanges PLANIFIE du jour et des 7 prochains jours.
3. **Alertes actives** : bloquantes d'abord. Bouton acquitter avec date et
   raison.
4. **Dates promises à 14 jours** avec date réaliste et écart.
5. **Chez les tiers** : attentes sans relance depuis plus de 7 jours. Bouton
   « relancé aujourd'hui ».

Un bandeau « depuis votre dernière visite » liste les événements survenus sur
les organisations de l'utilisateur, à partir d'un horodatage gardé dans le
navigateur (`localStorage`), sans table.

### 6.2 `/pilot/pipeline` : Prospects

Affiché « Prospects » depuis C-62 : le tableau suit un client jusqu'à la
signature. Ce qui a été vendu se lit dans `/pilot/ventes` (6.10).

Existant, plus :

- bouton « Nouveau prospect » qui ouvre un formulaire court (nom, type,
  responsable) ;
- sur chaque carte : jours dans l'étape, orange au-delà du seuil ; prochaine
  action et sa date, orange si absente ou passée ; montant pondéré ;
- menu « Déplacer vers » au clavier, même garde que le glisser ;
- la boîte de sortie demande la raison en texte et le code ; pour « en
  sommeil », la date de réveil ;
- rollback par carte en cas de refus serveur ;
- filtre « à moi ».

### 6.3 `/pilot/organisations/[id]`

Devient une fiche à onglets. L'en-tête garde identité, étape, responsables,
qualification en « 3/5 » avec les cases manquantes au survol, et le bouton de
changement d'étape.

| Onglet | Contenu | Actions |
|---|---|---|
| Résumé | identité, argent, prochaine action, décision attendue, dernier échange, alertes de l'organisation | modifier, changer d'étape |
| Contacts | liste avec rôle, attitude, dernier contact | ajouter, modifier, supprimer |
| Négociation | propositions par version, statut, montants, remise, engagement, validité ; plan de signature (jalons) | nouvelle version, envoyer, accepter, refuser, ajouter un jalon |
| Centres | centres groupés par vague, par produit : avancement, bloquantes, en attente de qui, date promise, date réaliste, glissement, prêt ou pas | ajouter un centre, rattacher un produit, poser une date promise, créer une vague |
| Argent | contrats et lignes, opportunités avec probabilité et catégorie, renouvellement et fin d'engagement | créer, modifier (direction et commerciaux) |
| Chronologie | événements et échanges fusionnés, du plus récent au plus ancien ; filtres par type | saisir un échange, planifier un rendez-vous |

`/pilot/organisations/nouveau` : formulaire complet de création.

### 6.4 `/pilot/integrations`

Existant, plus : colonne « en attente de », avec jours depuis la demande et
dernière relance ; colonne date réaliste et écart ; filtres par chef de projet,
par vague, par produit, par tiers ; mention « évalué il y a N min » ; les
régressions récentes en haut. Le clic sur une pastille manuelle ouvre un volet :
cocher, commentaire, déclarer une attente, relancer.

### 6.5 `/pilot/attentes` : chez les tiers

Toutes les étapes avec `enAttenteDe` non nul, groupées par tiers, triées par
ancienneté de demande. C'est la liste de relances du lundi. Bouton « relancé »
par ligne, bouton « levée » quand le tiers a répondu.

### 6.6 `/pilot/alertes`

Toutes les alertes, actives et acquittées, filtres par niveau, type,
organisation, responsable. Acquittement en ligne.

### 6.7 `/pilot/ca` (lot 2)

- en haut : récurrent signé du mois, part variable au jour près et projetée à
  fin de mois, mises en service du mois ;
- courbe 24 mois, trois lectures (signé seul, pondéré, optimiste), Recharts,
  recalculée dans le navigateur par `projeter()` ;
- à droite : liste des opportunités ouvertes avec case à cocher, probabilité,
  catégorie, date de démarrage glissable par mois ;
- scénarios : enregistrer, charger, comparer au réel figé mois par mois sur
  les mois passés ;
- export CSV, avec le bandeau « modèle tarifaire à valider » tant que Q1 est
  ouverte.

### 6.8 `/pilot/parc` (lot 3)

Une ligne par centre en production, quatre feux : usage (tendance 4 semaines
et pourcentage du volume annoncé), taux de RDV pris, incidents ouverts (tickets
du Dashboard, lecture seule), silence. Renouvellements et fins d'engagement à
90 jours. Adoption de Desk quand Desk existe.

### 6.9 Recherche

Champ en haut de la coquille, raccourci Ctrl+K, résultats groupés
organisations, contacts, centres.

### 6.10 `/pilot/ventes` : Ventes (C-62)

Une carte par client signé, en mise en service ou en service ; un segment pour
ceux dont le contrat manque ou est incomplet, un autre pour les contrats
terminés ; filtre « à moi ». Dans l'ordre où ça se passe :

| Case | Source |
|---|---|
| Formation | prochain rendez-vous `FORMATION` du journal, sinon le dernier fait, sinon `FORMATION_DASHBOARD` ou `FORMATION_SECRETAIRES` cochée |
| Interfaçage | même règle avec le type `INTERFACAGE` et la case `INTERFACAGE_TELEPHONIQUE` |
| Essai | `CrmContrat.essaiDebuteLe` et `essaiJours`, fin calculée |
| Début officiel | `CrmContrat.debuteLe` |
| Durée | `engagementMois`, fin d'engagement calculée (`echeancesContrat`) |
| Reconduction | `CrmContrat.reconduction`, prochaine échéance et limite du préavis (`echeancesContrat`) |
| Produits | rattachements des centres (`miseEnProductionLe`, `datePromise`) et lignes du contrat, un produit par ligne avec ses propres dates |
| Conditions tarifaires | lignes du contrat et `conditionsTarifaires` |

Règles pures dans `src/lib/ventes/regles.ts`, lecture dans
`src/lib/ventes/charger.ts`, calculée à une seule horloge côté serveur.
Actions : modifier le contrat (dialogue de la fiche), planifier une formation ou
un interfaçage (dialogue du journal, prérempli).

---

## 7. Traitements périodiques

Tous écrits comme des scripts Node dans `scripts/`, appelant les services de
`src/lib`. Au Dashboard, le cron système vit hors dépôt sur le VPS : la
livraison inclut la ligne de crontab à poser.

| Script | Fréquence | Fait |
|---|---|---|
| `scripts/evaluer-parc.ts` | toutes les 15 minutes | `evaluerParc()` : trois requêtes de lecture, une transaction d'écriture, événements de régression. L'écran Intégrations ne déclenche plus l'évaluation ; il lit et affiche `evalueeLe`. Une action manuelle (cocher, rattacher) déclenche `evaluerCentre(id)` ponctuellement. |
| `scripts/figer-ca.ts` | le 1er du mois à 02:00 | `figerMois(moisPrecedent)` : calcule le réel depuis les compteurs Dashboard et les contrats actifs, écrit `CrmCaMensuel`, refuse de réécrire une ligne déjà figée, journalise CA_MENSUEL_FIGE. Rejouable : la deuxième exécution ne fait rien. |
| `scripts/expirer-propositions.ts` | quotidien | passe en EXPIREE les propositions ENVOYEE ou EN_DISCUSSION dont `valideJusquAu` est dépassée, journalise. |
| `scripts/import-csv.ts` | à la demande | import minimal, voir 9.6. |

Les réveils (`reveilLe`), les renouvellements et les fins d'engagement ne
demandent aucun traitement : ils se calculent à la lecture dans les alertes.

---

## 8. Algorithmes

### 8.1 Vieillissement par étape

`jours = maintenant - etapeDepuisLe`. Seuils de départ, dans `pipeline.ts`, à
réviser après trois mois de journal :

| Étape | Seuil |
|---|---|
| PROSPECT | 21 |
| POURPARLERS | 30 |
| VISIO_TECHNIQUE | 21 |
| PROPOSITION | 30 |
| SIGNE | 14 |
| EN_INTEGRATION | 90 |

Le journal donne la médiane réelle : durée entre deux événements
ETAPE_COMMERCIALE_CHANGEE consécutifs d'une même organisation.

### 8.2 Différence d'évaluation et régressions

`diffEtapes` compare, pour chaque définition applicable au produit, l'état de
complétude et la ligne existante :

- ligne absente : création, vide ou cochée selon le verdict ;
- verdict identique : seule `evalueeLe` avance ;
- faux → vrai : cochée, `faiteLe = maintenant`, événement COCHEE (auteur système) ;
- vrai → faux : décochée, `faiteLe` effacé, `motif` posé, événement
  REGRESSION avec `avant.faiteLe`. C'est une alerte bloquante tant que la case
  reste vide ;
- `etat === null` : motif « Aucun UserProduct au Dashboard pour ce centre »,
  comme aujourd'hui.

Les étapes MANUEL ne sont jamais touchées. Le volet automatique de l'étape
MIXTE renseigne le motif et ne coche jamais ; le volet manuel coche. Cette règle
est documentée dans `definition.ts`.

### 8.3 Date réaliste

Pour chaque étape bloquante ouverte :

```
ecoule = jours(creeLe → maintenant)
reste  = max(1, dureeAttendueJours - ecoule)
si echeanceLe existe : reste = max(reste, jours(maintenant → echeanceLe))
si enAttenteDe est un tiers externe (EDL, OPERATEUR, PRESTATAIRE) et aucune
  échéance : reste = max(reste, 7)
```

`dateRealiste = maintenant + max(reste)` sur les étapes bloquantes ouvertes,
puis `+ dureeAttendue(PASSAGE_PRODUCTION)` si cette étape n'est pas cochée.
Hypothèse : les étapes avancent en parallèle. `etapeCritique` est celle qui
porte le maximum. L'écart affiché est `dateRealiste - datePromise`, en jours,
signé. L'heuristique est marquée « estimation » à l'écran et se corrige avec le
journal.

### 8.4 Glissement d'une date promise

Depuis le journal : nombre d'événements DATE_PROMISE_CHANGEE sur le
rattachement, et `datePromise - datePromiseInitiale` en jours. Au-delà de deux
reports ou de 30 jours cumulés, alerte « attention ».

### 8.5 Prêt à passer en production

`pret.ts` renvoie `{ pret: boolean, manquantes: { cle, libelle, enAttenteDe, motif }[] }`
sur les étapes bloquantes ouvertes. Le cochage manuel de PASSAGE_PRODUCTION
reste permis avec des manquantes : la fiche dit « en production avec réserves »
et l'alerte n° 3 existante le rappelle.

### 8.6 Prochaine action dénormalisée

À chaque écriture d'un échange : `prochaineActionLe` de l'organisation prend la
plus proche date future parmi les échanges REALISE portant une prochaine
action non faite, ou la date de l'échange PLANIFIE le plus proche. « Marquer
faite » efface le champ et invite à en saisir une autre. Une organisation en
étape commerciale sans prochaine action est signalée, jamais bloquée.

### 8.7 Alertes

Calcul pur sur un chargement unique. Les cinq alertes existantes restent, avec
leurs clés. Nouvelles alertes et clés :

| Clé | Niveau | Condition |
|---|---|---|
| `action-en-retard-{org}` | attention | `prochaineActionLe` passée |
| `sans-prochaine-action-{org}` | attention | étape commerciale, aucune action datée |
| `vieillissement-{org}` | attention | jours dans l'étape > seuil |
| `reveil-{org}` | attention | EN_SOMMEIL et `reveilLe` atteint |
| `proposition-expiree-{prop}` | attention | ENVOYEE ou EN_DISCUSSION, validité dépassée de plus de 3 jours |
| `decision-depassee-{org}` | attention | `decisionAttendueLe` passée en PROPOSITION |
| `attente-sans-relance-{etape}` | attention | `enAttenteDe` posé, dernière relance ou demande > 7 jours |
| `regression-{etape}` | bloquant | ligne automatique décochée par l'évaluateur, toujours vide |
| `glissement-{rattachement}` | attention | plus de 2 reports ou 30 jours cumulés |
| `silence-renforce-{rattachement}` | bloquant | pendant `suiviRenforceJusquAu`, aucun appel depuis 24 h (remplace `silence-` sur la période) |
| `renouvellement-{contrat}` | attention | `renouvelleLe` ou fin d'engagement dans 90 jours |

Un acquittement dont `jusquAu` est futur range l'alerte dans `acquittees`. Le
« à moi » filtre sur `responsableId` pour les alertes commerciales et sur
`chefDeProjetId` pour les alertes d'intégration ; sans chef de projet, le
commercial reçoit tout.

### 8.8 Projection de chiffre d'affaires

Pour chaque mois `m` de `moisDepart` à `moisDepart + 23` :

```
R(m)  = Σ lignes ABONNEMENT des contrats ACTIF avec debuteLe ≤ m
        et (termineLe null ou termineLe ≥ m)
V(m)  = Σ variableMensuelleParLigne (moyenne des 3 derniers mois figés,
        0 si aucun) pour les mêmes contrats
S(m)  = Σ lignes MISE_EN_SERVICE des contrats dont debuteLe est dans m
signe(m)     = R + V + S
pondere(m)   = signe + Σ sur opportunités ouvertes cochées avec
               demarrage(o) ≤ m :  p_o × M_o / 100 (+ p_o × MES_o / 100 si demarrage(o) = m)
optimiste(m) = même somme avec p_o = 100
```

`demarrage(o)` = `scenario.decalages.get(o.id)` sinon `o.demarrageAttenduLe`,
ramené au premier du mois. Une opportunité sans date de démarrage ne compte
pas, et l'écran le dit. La probabilité est `probabilite` si `probabiliteForcee`,
sinon `PROBABILITE_PAR_ETAPE[etape de l'organisation]`. Les EXCLU ne comptent
jamais. Tout en centimes entiers ; les produits `p × M / 100` sont arrondis à
l'entier une fois par opportunité et par mois.

Un contrat dont l'engagement se termine sans `renouvelleLe` continue de compter
(reconduction tacite supposée) mais l'alerte renouvellement existe. Un contrat
TERMINE ne compte plus après `termineLe`.

### 8.9 Réel mensuel

`figerMois(mois)` : pour chaque contrat ACTIF sur le mois, par ligne :
ABONNEMENT → `montantCentimes` ; MISE_EN_SERVICE → si `debuteLe` dans le
mois ; PART_VARIABLE → compteur du Dashboard pour l'unité (en local, `Call`
et `Call.rdvPris` ; au Dashboard, trancher entre `Call`, `CallConversation` et la
remontée Konnect, question ouverte du brief) moins `volumeInclus`, borné à
zéro, multiplié par `montantCentimes`. Clé déterministe, `figeLe = maintenant`,
refus silencieux si la clé existe.

`moisCourant()` : même calcul sur le mois en cours, part variable projetée par
`volume × joursDuMois / joursEcoules`, jamais figé.

### 8.10 Acceptation d'une proposition

Transaction :

1. proposition → ACCEPTEE, `repondueLe = maintenant` ;
2. les autres versions ENVOYEE ou EN_DISCUSSION de la même organisation →
   REFUSEE, événement ;
3. contrat créé : `statut ACTIF`, `signeLe = maintenant`, `debuteLe` saisi ou
   null, `engagementMois`, `preavisMois`, `propositionId`, lignes copiées
   champ à champ ;
4. opportunités ouvertes de l'organisation sur les produits de la proposition
   → `gagneeLe = maintenant` ;
5. si `transitionPermise(etape, SIGNE)`, `changerEtape(SIGNE)` ; sinon rien, et
   la réponse le signale ;
6. événements PROPOSITION_STATUT_CHANGE et CONTRAT_CREE.

Transitions de statut permises : BROUILLON → ENVOYEE ; ENVOYEE →
EN_DISCUSSION, ACCEPTEE, REFUSEE, EXPIREE ; EN_DISCUSSION → ACCEPTEE, REFUSEE,
EXPIREE. Une nouvelle version part de BROUILLON avec les lignes de la version
la plus récente.

---

## 9. Transverse

### 9.1 Autorisations

| Action | Rôles |
|---|---|
| lire | tous |
| créer, modifier organisations, contacts, centres, échanges, étapes, attentes, acquittements | tous |
| propositions, contrats, lignes, opportunités (montants) | droit « Modifier les montants » (`peutModifierLesMontants`) |
| page et données du chiffre d'affaires, scénarios | droit « Voir le chiffre d'affaires » (`peutVoirCa`), jamais un développeur |
| export comptable | droit « Exporter pour la comptabilité » (`peutExporterCa`) |
| évaluation à la demande | droit « Vérifier les étapes automatiques » (`peutEvaluer`) |
| comptes de l'équipe, rôles et droits ; import et export de l'apport d'affaires | SUPER_ADMIN |

Depuis C-64, les droits viennent du rôle Pilot (gérant ou développeur) et des
cases cochées par le super-administrateur, relus à chaque appel
(`src/lib/acces/droits.ts`). SUPER_ADMIN a tous les droits.

`autorisations.ts` est appelé par chaque route concernée dès le lot 1 bis, avec
le bouchon de session. À l'intégration, seul `session.ts` change ; les rôles
réels (direction, commercial, chef de projet) se mappent sur les rôles
NextAuth du Dashboard à ce moment, et le mapping est une décision à écrire.

### 9.2 Données personnelles

Pilot ne porte que des contacts professionnels. `DELETE /contacts/[id]` existe
pour la suppression sur demande. L'événement CONTACT_SUPPRIME ne stocke ni
`avant` ni `apres`, pour que la suppression soit réelle. Les événements
ECHANGE_* ne stockent pas le compte rendu, seulement le type et la date. Les
logs stdout ne portent jamais `avant` / `apres`.

### 9.3 Performance

- `evaluerParc()` : une requête rattachements + produits, une requête étapes
  existantes, une requête d'états de complétude (`evaluerPlusieurs`), une
  transaction d'écriture. Au Dashboard, `evaluerPlusieurs` enveloppe
  `evaluerCentre` dans une boucle ou une version groupée si elle existe ;
  l'adaptateur isole ce choix.
- Alertes : `charger.ts` fait cinq requêtes au total, quelle que soit la taille
  du parc.
- Index ajoutés : voir le schéma. `CrmEvenement` est la table qui grossit ; la
  chronologie d'une fiche se pagine par 50.
- Les écrans restent `force-dynamic`. Aucun cache applicatif.

### 9.4 Tests

Vitest, décision C-12. `npm test`. Cibles, dans l'ordre :

1. `transitionPermise` : table de toutes les paires ;
2. `diffEtapes` : création, cochage, régression, étape mixte, état nul ;
3. `dateRealiste` : parallèle, échéance, tiers sans échéance ;
4. `calculerAlertes` : chaque clé, acquittement, « à moi » ;
5. `projeter` : contrat qui démarre, qui s'arrête, opportunité cochée,
   décalage, catégorie EXCLU, arrondi en centimes ;
6. `qualification`, `glissement`, transitions de proposition ;
7. `figerMois` et `accepter` en intégration contre une base de test, si une
   base de test est posée ; sinon, les règles pures sont extraites et testées.

Les six cas HTTP du brief (§7.5) deviennent des tests d'intégration des routes
quand une base de test existe ; en attendant, un script `scripts/verifier.ts`
les rejoue en `fetch` contre le serveur de développement et lit les
identifiants en base.

### 9.5 Accessibilité

Menu « Déplacer vers » sur chaque carte du pipeline. Tous les volets et
formulaires ferment à Échap. Les pastilles de la check-list sont des boutons
avec libellé lisible par un lecteur d'écran, pas des cercles colorés seuls.

### 9.6 Import CSV

`scripts/import-csv.ts chemin.csv`. Colonnes acceptées : `cle`, `nom`, `type`,
`etape`, `responsable_email`, `chef_de_projet_email`, `ris`, `nombre_sites`,
`contact_nom`, `contact_fonction`, `contact_email`, `contact_telephone`,
`dernier_echange_le`, `notes`. Upsert par `importCle = cle`. Une organisation
importée a `etapeDepuisLe = maintenant` et aucune prochaine action : elle
apparaît aussitôt dans « sans prochaine action », ce qui est voulu. Rapport
en sortie : créées, mises à jour, lignes refusées et pourquoi. Un seul
événement IMPORT_EXECUTE avec les comptes.

---

## 10. Ordre de livraison

Chaque incrément : un fichier SQL, le schéma, les services, les routes, les
écrans, les tests, `npm run build` vert, une entrée dans `CHOIX.md` si une
décision est prise. Le seed s'enrichit à chaque incrément pour couvrir les
nouveaux cas, et les faits du §11 du brief restent vrais.

### Lot 1 bis : utilisable au quotidien

| # | Incrément | Fini quand |
|---|---|---|
| A | Journal, autorisations, `changerEtape` | Les trois routes existantes journalisent. La chronologie de la fiche affiche les événements. `peutModifierLesMontants` est appelé. Vitest en place avec `transitionPermise`. |
| B | Création et édition | Un commercial crée un prospect, ses contacts, ses centres, ses rattachements depuis les écrans, sans SQL. Suppression d'un contact. |
| C | Actions et Aujourd'hui | Prochaine action dénormalisée, vieillissement, raisons codées, réveil, qualification, attitude, échanges planifiés. La page `/pilot` est la page Aujourd'hui. |
| D | Attentes et évaluation par lots | « En attente de » déclarable, page Chez les tiers, `evaluerParc()` en une transaction, cron toutes les 15 min, régressions journalisées. L'écran Intégrations ne déclenche plus l'évaluation. |
| E | Alertes acquittables | Toutes les alertes du §8.7, acquittement, page Alertes, filtre « à moi », `calculerAlertes` pur et testé. |
| F | Finitions | Clavier sur le pipeline, rollback par carte, recherche Ctrl+K, import CSV, vagues et glissement de date promise. |

### Lot 2 : argent et dates

| # | Incrément | Fini quand |
|---|---|---|
| G | Propositions | Versions, transitions, expiration quotidienne, acceptation qui crée le contrat et passe en SIGNE. Onglet Négociation. Plan de signature par jalons. |
| H | Contrats et opportunités | Édition complète, engagement et préavis, catégorie de prévision, renouvellements en alerte. |
| I | Moteur et écran CA | `projeter` pur et testé, courbe 24 mois, trois lectures, coche sans aller-retour, décalage de démarrage, scénarios enregistrés. |
| J | Réel figé et export | `figerMois`, cron mensuel, mois courant au jour près, comparaison scénario / réel, export CSV marqué « à valider » tant que Q1 est ouverte. |
| K | Date réaliste et suivi renforcé | Date réaliste sur Intégrations et sur la fiche, prêt ou pas, suivi renforcé 14 jours. |

**Prérequis humain avant de faire confiance à J** : trancher le modèle
tarifaire (Q1) et la source des compteurs variables au Dashboard.

### Lot 3 : santé du parc

| # | Incrément | Fini quand |
|---|---|---|
| L | Parc | Quatre feux par centre en production, usage contre volume annoncé, tickets en lecture, adoption de Desk quand Desk existe. |

---

## 11. Décisions à consigner dans `CHOIX.md`

| Code | Décision |
|---|---|
| C-12 | Vitest comme unique bibliothèque ajoutée ; les tests unitaires portent sur les fonctions pures ; raison : un code sans test ne se transpose pas sereinement au Dashboard. |
| C-13 | Colonnes `Json` (`jsonb`) pour `avant` / `apres` de `CrmEvenement` ; jamais de donnée patient, jamais les champs d'un contact supprimé. |
| C-14 | Remise en pour-mille entier, par cohérence avec « jamais de flottant pour l'argent ». |
| C-15 | Propositions et contrats dans deux tables de même forme ; l'acceptation copie ; raison : un devis refusé n'est pas un contrat, et l'historique de négociation doit survivre à la signature. |
| C-16 | Réel mensuel figé dans `CrmCaMensuel`, jamais réécrit ; raison : les compteurs du Dashboard sont vivants, un scénario ne peut se comparer qu'à un passé immobile. |
| C-17 | Évaluation de la check-list par passage périodique, pas à l'ouverture de l'écran ; l'écran affiche l'heure de la dernière évaluation. |
| C-18 | Deux responsables par organisation : commercial et chef de projet. |
| C-19 | Suppression d'un contact : événement sans contenu, pour que la suppression soit réelle. |
| C-20 | Seuils de vieillissement et durées attendues dans le code, révisés après trois mois de journal (Q7). |
| C-21 | Export comptable livré mais marqué « à valider » tant que le modèle tarifaire n'est pas tranché (Q1). |

---

## 12. Points d'attention pour l'intégration au Dashboard

En plus de `INTEGRATION-DASHBOARD.md`, qui reste valable :

- `journaliser()` doit appeler `auditLog(...)` du Dashboard en plus d'écrire
  `CrmEvenement`, ou être remplacé par une fonction qui fait les deux.
- `evaluerPlusieurs` enveloppe `evaluerCentre` ; vérifier son coût sur le parc
  réel avant de fixer la fréquence du cron.
- Les compteurs variables : `Call` contre `CallConversation` contre la
  remontée Konnect, à trancher avant J.
- Les trois crons sont à poser sur le VPS, hors dépôt.
- Les rôles direction, commercial, chef de projet se mappent sur
  `SUPER_ADMIN` / `ADMIN` ; si le Dashboard distingue des sous-comptes ou des
  permissions par page, le mapping est une décision à écrire le jour venu.
- Un fichier SQL qui ajoute une valeur d'énumération ne l'emploie pas dans le
  même fichier (transaction implicite du script d'application).
