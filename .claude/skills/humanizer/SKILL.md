---
name: humanizer
description: Rendre un texte moins « robot », écran, libellé, message d'erreur, mail, SMS, notification, texte d'onboarding, en français. Repère les tics d'écriture de machine et les réécrit dans le ton Lyrae. À utiliser quand l'utilisateur dit « humanise », « moins robot », « ça sonne IA », ou avant de livrer un texte lu par une secrétaire ou un patient.
---

# humanizer (version locale Lyrae)

Version écrite pour ce workspace, en français, à partir de la règle « Ton des textes
affichés » de `CLAUDE.md`. Ce n'est pas le skill public du même nom.

Nos lecteurs sont des **secrétaires médicales** et des **patients**, souvent âgés, souvent
sur un téléphone. Un texte qui sonne machine leur fait douter de l'outil.

## 1. D'abord : est-ce un texte affiché ?

**Ne pas humaniser**, même si ça sonne robot :

- un **log**. Ceux de LyraeTalk sont un contrat lu par `daily-report` et Grafana
  (`contracts/shared/log-schema.md`) ;
- un **prompt de LLM** (`azure-functions`, `daily-report/src/llm`). Le réécrire change le
  comportement du robot, et un push sur `main` d'azure-functions est une mise en production ;
- du **code qui traite le texte** : la normalisation OCR de Konnect manipule les tirets
  pour de bon (`ocr/text_normalizer.py`, `ocr/exam_matcher.py`) ;
- une **phrase dite à voix haute** par le robot : ce qui compte est ce qu'on entend ;
- une **valeur d'énumération** ou un marqueur : les renommer casse un routage à distance.

Commentaires de code et documentation interne : la règle ne les vise pas.

## 2. Les tics à chercher

| Tic | Exemple | À la place |
|---|---|---|
| Tiret cadratin ou demi-cadratin | « Bloqué — le patient doit rappeler » | deux-points, virgule, point, parenthèses |
| Formule creuse | « n'hésitez pas à », « il est important de noter que », « afin de garantir » | dire la chose |
| Triplet décoratif | « simple, rapide et sécurisé » | le seul adjectif vrai, ou aucun |
| Fausse opposition | « Ce n'est pas un simple X, c'est un Y » | dire ce que c'est |
| Généralité sur une erreur | « Une erreur est survenue » | ce qui s'est passé, et quoi faire ensuite |
| Vocabulaire interne | « le RIS », « le tenant », « le mapping » face à un patient | « votre logiciel de gestion », ou le mot du lecteur |
| Politesse de machine | « Nous vous remercions de votre patience » | rien, ou une phrase utile |
| Emphase | majuscules, gras partout, point d'exclamation | une phrase plus courte |
| Emoji | dans un écran, un mail, un SMS | une icône du système, ou rien |
| Symétrie forcée | trois puces de même longueur pour un contenu inégal | la forme que le contenu demande |

## 3. Réécrire

Écrire comme on parlerait à un collègue qu'on aide à se servir de l'outil. Phrases courtes,
verbe à l'indicatif, on dit ce qu'il faut faire. Choisir la ponctuation par le sens :

- **deux-points** quand suit une explication ou une valeur : « Bloqué : le patient doit rappeler » ;
- **virgule** pour une précision courte : « Urgence signalée, à traiter en priorité » ;
- **point** quand ce sont deux phrases : « Votre demande est enregistrée. Il n'y a rien d'autre à faire. » ;
- **« de… à… »** et **« du… au… »** pour une fourchette : jamais « 500, 1 500 appels » ;
- un **tiret simple** pour une cellule vide.

Un message d'erreur répond à deux questions : qu'est-ce qui s'est passé, que fais-je
maintenant. « Le code RIS est déjà utilisé par un autre examen » vaut mieux que « Erreur de
validation ».

## 4. Outils

```bash
python ../../scripts/tirets.py src --detail --sans-tests   # les tirets en texte affiché
python ../../scripts/verify_changed.py                                     # refuse un tiret ou un emoji AJOUTÉ
```

`tirets.py` a des faux positifs sur le JSX (une apostrophe ouvre une fausse chaîne) : relire
avant de corriger, et faire tourner un remplacement de masse **à blanc** d'abord. Le
18/09/2026, une règle générale aurait transformé « 500 – 1 500 appels » en « 500, 1 500 ».

## 5. Après

Si le texte modifié est comparé par un test, le test change avec lui : chercher l'ancienne
chaîne dans les tests. Rendre à l'utilisateur l'avant et l'après des textes importants, pas
seulement « c'est fait ».
