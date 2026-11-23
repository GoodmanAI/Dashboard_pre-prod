# LYRAE PILOT

CRM interne du parc Lyrae : qui est prospect, qui est en intégration et à quelle
étape, qui est en production, qui est parti, et ce que l'ensemble rapporte.

Pilot suit un client **du premier contact à la production**, pour les trois
produits de l'écosystème : **LyraeTalk** (agent vocal téléphonique), **Konnect**
(portail patient) et **Desk** (poste de travail des secrétaires).

> Nom provisoire. Le dossier produit laisse la question ouverte, à côté de Véga.

## Ce que Pilot est, et n'est pas

Pilot **ne possède aucune donnée patient**. Il manipule des organisations, des
contacts professionnels, des contrats et des agrégats.

Pilot **lit** le Dashboard et **n'écrit jamais sa configuration**. Une partie de
la check-list d'intégration se coche toute seule, parce que le Dashboard sait
déjà si le mapping d'examens est fait ou si le numéro d'appel est posé. Une
étape automatique ne peut pas être cochée à la main : il n'y a jamais deux
vérités.

Pilot **n'est pas un logiciel de facturation**. Il exporte en CSV ce que la
comptabilité doit facturer.

## Où ce dépôt se situe

Le dossier produit recommande que Pilot vive **dans le dépôt dashboard**, comme
un produit de plus au sens de la table `Product` : l'authentification, les
droits et le système visuel y sont déjà.

Ce dépôt-ci est un **atelier local**. Il reprend la même pile (Next.js 14 App
Router, TypeScript, MUI 5, Prisma 6, PostgreSQL) et les mêmes conventions, pour
que les fichiers se transposent sans réécriture :

| Ici | Au Dashboard |
|---|---|
| `src/app/pilot/*` | `src/app/pilot/*` dans l'espace admin |
| `src/app/api/pilot/*` | `src/app/api/pilot/*`, ajoutées à la whitelist de `middleware.ts` si besoin |
| modèles `Crm*` de `prisma/schema.prisma` | mêmes modèles, mêmes noms |
| `prisma/migrations/manual/*.sql` | même dossier, même convention idempotente |
| modèles « miroir Dashboard » | **ne partent pas** : ils existent déjà là-bas |
| `src/lib/session.ts` | remplacé par la session NextAuth du Dashboard |
| `src/lib/completude/adapter.ts` | remplacé par `evaluerCentre` de `lib/completude` |

Les écarts et leurs raisons sont dans [`CHOIX.md`](./CHOIX.md).

## Démarrer

**Pour tester**, sans rien installer d'autre que Node 20+ :

```bash
npm install
npm run demarrer        # base embarquée, http://localhost:3100
```

Connexion : `admin@exemple.test`, mot de passe `demo-pilot`. Voir CHOIX.md, C-67.

**Pour développer**, avec PostgreSQL 14+ (testé sur 18) :

```bash
npm install
```

La base et le rôle applicatif sont provisionnés à part, puis renseignés dans
`.env` (copier `.env.example`). Aucun secret n'est versionné.

```bash
npm run db:generate     # client Prisma
npm run db:push         # pose le schéma local
npm run db:manual       # applique le SQL manuel destiné au Dashboard
npm run seed            # jeu de démonstration, noms neutres
npm run dev             # http://localhost:3100
```

Ouvrir `/pilot/integrations` une première fois : les cases automatiques s'y
remplissent depuis le registre de complétude.

Comptes de démonstration, tous avec le mot de passe `PILOT_MOT_DE_PASSE_LOCAL`
de `.env` : `admin@exemple.test` (super-administrateur, écran Équipe),
`commercial.a@exemple.test` et `projet.a@exemple.test` (gérants),
`dev.a@exemple.test` (développeur, sans le chiffre d'affaires). Voir CHOIX.md,
C-64.

## Le cycle de vie

```
COMMERCIAL     Prospect → Pourparlers → Visio technique → Proposition
                                                              ↓
LIVRAISON      Arrêté ← En production ← En intégration ← Signé
                  ↑ reconquête
```

Toute étape commerciale peut sortir en **Perdu** ou **En sommeil**, la raison
est obligatoire. Un centre arrêté peut repartir en prospect.

L'**organisation** porte l'étape commerciale ; chaque **centre** porte son étape
d'intégration **par produit**. Un centre peut être en production sur LyraeTalk et
en intégration sur Konnect.

## La check-list d'intégration

Onze étapes par centre et par produit ([`src/lib/checklist/definition.ts`](src/lib/checklist/definition.ts)).
Cinq sont automatiques (jeton Xplore, code centre, mapping des examens, réglages
du robot, premier appel réel), une est mixte (interfaçage téléphonique), les
autres sont manuelles avec date et auteur.

Quand une case automatique est vide, l'écran affiche **pourquoi** : « Mapping
incomplet : 2 examens sur 5 attendus », « Aucun UserProduct au Dashboard pour ce
centre ». Un chef de projet ne doit pas avoir à deviner ce qui bloque.

## Les alertes

Calculées à la lecture, jamais stockées :

1. une étape ouverte au-delà de sa durée prévue ;
2. une date promise qui approche avec des étapes bloquantes ouvertes ;
3. un centre déclaré en production avec un élément bloquant manquant ;
4. un client en production sans appel ni RDV depuis 48 h ;
5. un prospect sans contact depuis 30 jours.

À l'intégration, elles partent dans `Notification` et en mail Brevo, assignées au
responsable du client.

## État des lots

| Lot | Contenu | État |
|---|---|---|
| 1 | Suivi client : fiches, pipeline, check-list auto | **construit** |
| 2 | CA et scénarios : CA en temps réel, simulations sur 24 mois | à venir |
| 3 | Santé du parc : usage, adoption de Desk, alertes | à venir |

Les tables du lot 2 (`CrmContrat`, `CrmLigneContrat`, `CrmOpportunite`,
`CrmScenario`) existent déjà et se remplissent : seuls les écrans de projection
manquent.
