# Prompt de reprise pour un nouveau fil

À coller tel quel dans une nouvelle session ouverte sur ce dépôt.

---

Lis dans l'ordre `CLAUDE.md`, `CHOIX.md`, `docs/BRIEF-AMELIORATION.md`,
`docs/PROPOSITIONS-AMELIORATION.md` puis `docs/ARCHITECTURE.md`. La
planification est terminée, tout est décidé dans `docs/ARCHITECTURE.md` :
modèle de données, modules, routes, écrans, algorithmes, et l'ordre de
livraison en douze incréments A à L. Ne replanifie rien, ne pose une question
que si l'architecture est muette ou contradictoire.

Développe incrément par incrément, dans l'ordre, un seul à la fois. Pour
chaque incrément : délègue l'implémentation à des sous-agents Codex
(`codex:codex-rescue` ou la skill `codex-dispatch`) avec un brief précis tiré
de l'architecture ; relis ensuite leur travail avec une revue de code
(`/code-review` ou `codex-review:code`) et corrige avant de passer au suivant.
Un incrément est fini quand son critère « fini quand » de la section 10 est
vrai, que `npm run build` et `npm test` passent, que le seed couvre les
nouveaux cas, que les faits du §11 du brief restent vrais, et que toute
décision prise est écrite dans `CHOIX.md`. Un commit local par incrément,
message en français, rien ne part sur GitHub.

Trois exigences de qualité, non négociables :

1. **Ergonomie.** Chaque écran se termine par une action. Un chef de projet ou
   un commercial doit comprendre quoi faire sans explication. Quand une case
   est vide, l'écran dit pourquoi. Clavier partout, Échap ferme, Ctrl+K cherche.
2. **Code efficace.** Fonctions pures testées, pas de N+1, pas d'évaluation à
   l'ouverture d'écran, requêtes comptées, argent en centimes entiers, gardes
   côté serveur, journalisation de toute mutation.
3. **Design ultra élégant, esprit Apple.** Sobriété, espace, hiérarchie
   typographique nette, peu de couleurs et toujours les mêmes, transitions
   discrètes, aucun ornement. Tout en MUI 5 et dans le thème existant
   (`src/theme.ts`), sans bibliothèque ajoutée. Phrases courtes, aucun tiret
   cadratin, aucun emoji, aucune icône décorative, aucun vocabulaire interne
   sur un écran qu'un commercial montre à l'extérieur.

Les règles de `CLAUDE.md` priment sur tout : aucune donnée patient, Pilot lit
le Dashboard et ne l'écrit jamais, une étape automatique ne se coche jamais à
la main, les énumérations ne se renomment jamais, aucune donnée patient dans
les logs. Commence par l'incrément A.
