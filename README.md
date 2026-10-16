# Quinquennat — À vous de gouverner

Jeu de gestion budgétaire de la France, conçu pour des **élèves de Terminale STMG**.
Chaque équipe gouverne le pays pendant **5 ans** : elle vote un budget annuel
(16 leviers de recettes et de dépenses), affronte des **événements** (crises,
canicule, pandémie, émeutes, choc énergétique…), des **lobbies** et des
**dilemmes éthiques**, puis passe devant les électeurs. Un **conseiller** livre
un bilan après chaque année, et une **élection finale** tranche entre réélection,
défaite ou crise. Un score et un classement permettent de comparer les équipes.

> Outil pédagogique : les chiffres (2025, arrondis) et le modèle macro-économique
> (multiplicateurs, loi d'Okun, dynamique de dette) donnent des **ordres de
> grandeur crédibles**, pas une prévision officielle.

## Objectifs pédagogiques

- Comprendre les **arbitrages** budgétaires : aucun choix n'est gratuit.
- Distinguer recettes (TVA, IR progressif, CSG, IS, cotisations, patrimoine…)
  et postes de dépense (retraites, santé, éducation, défense…).
- Saisir des notions clés via les bulles « Le saviez-vous ? » (multiplicateur,
  impôt régressif/progressif, effet boule de neige de la dette, Pacte de stabilité…).
- Mesurer l'impact des décisions sur l'économie, le social, l'environnement,
  la popularité et l'intégrité.

## Démarrage

Pré-requis : [Node.js](https://nodejs.org) 18 ou plus.

```bash
npm install      # installe les dépendances
npm run dev      # lance le serveur local (http://localhost:5173)
```

Pour produire la version à mettre en ligne :

```bash
npm run build    # génère le dossier dist/
npm run preview  # prévisualise la version de production
```

## Mettre en ligne

Le projet est configuré avec `base: "./"` (chemins relatifs), compatible avec :

- **GitHub Pages** : publiez le contenu de `dist/` (ex. via l'action
  `peaceiris/actions-gh-pages` ou la branche `gh-pages`).
- **Netlify / Vercel** : commande de build `npm run build`, dossier publié `dist`.

## Utilisation en classe

1. Chaque équipe ouvre le jeu sur son poste.
2. Elle saisit un **code de classe commun** (ex. `STMG-A`) et son **nom d'équipe**,
   puis choisit une **doctrine** (Rigueur, Solidarité, Compétitivité, Souveraineté).
3. À la fin, le **débriefing** affiche le score et le classement, support idéal
   pour une discussion collective.

### Limite importante — classement

Le classement et les sauvegardes utilisent le **stockage local du navigateur**
(`localStorage`). Il est donc **propre à chaque poste** : les scores ne se
partagent pas automatiquement entre ordinateurs. Pour un classement commun en
salle, deux pistes :

- faire jouer toutes les équipes sur **un même poste** (projeté), ou
- relever les scores à la main lors du débriefing.

Un classement réellement partagé nécessiterait un petit back-end (Firebase,
Supabase, ou une API maison) — piste d'évolution possible.

## Pile technique

- [React 18](https://react.dev) + [Vite 5](https://vitejs.dev)
- Icônes [Tabler](https://tabler.io/icons) et polices Google Fonts chargées via
  CDN (une connexion Internet est requise pour les afficher ; la mise en page
  fonctionne sans).

## Structure

```
quinquennat/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx        # point d'entrée React
│   ├── App.jsx         # tout le jeu (données, moteur, interface)
│   └── index.css
└── README.md
```

## Licence

[MIT](LICENSE) — libre d'utilisation, de modification et de diffusion.

---

*Conçu comme support pédagogique pour l'enseignement de l'Économie-Gestion.*
