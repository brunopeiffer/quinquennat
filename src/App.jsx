import React, { useState, useEffect, useMemo, useCallback } from "react";

/* ============================================================
   QUINQUENNAT — À VOUS DE GOUVERNER
   Jeu de gestion budgétaire pour Terminale STMG.
   France, 5 ans. Taux/budgets persistants, chiffres réalistes.
   ============================================================ */

const START = {
  solde: -5.0, dette: 116, chomage: 7.5, croissance: 1.0,
  popularite: 52, cohesion: 55, integrite: 70, environnement: 50,
};
const PIB = 3000;           // Md€ (1 % PIB ≈ 30 Md€)
const YEARS = 5;
const POP_FR = 68;          // millions d'habitants
// --- Amplification "jeu" : les décisions ont un impact plus fort que dans la réalité,
// pour qu'un bon mandat puisse viser 0 % de déficit, voire un excédent, en 5 ans. ---
const SOLDE_DIV = 14;       // Md€ pour bouger le solde de 1 point de PIB (réel ≈ 30)
const IMPACT = 1.4;         // amplifie l'effet des leviers sur les jauges (popularité, cohésion…)
const IMPULSE_GAIN = 1.5;   // amplifie l'effet des décisions sur la croissance
const LEVEL_MIN = -8, LEVEL_MAX = 10;   // bornes cumulées d'un levier
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (n, d = 0) => (n ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d });

// Équivalence concrète d'un montant en Md€ : euros par habitant et par an
const parHabitant = (md) => (md * 1000) / POP_FR;   // €/habitant/an
const eqHab = (md) => `${md >= 0 ? "+" : ""}${fmt(parHabitant(md))} €/habitant`;

// Objectifs affichés en permanence (repères pour l'élève)
const OBJECTIFS = [
  { id: "deficit", label: "Déficit < 3 %", icon: "wallet", ok: (i) => i.solde > -3, near: (i) => i.solde > -5 },
  { id: "dette", label: "Dette maîtrisée", icon: "chart-line", ok: (i) => i.dette <= 116, near: (i) => i.dette <= 125 },
  { id: "chomage", label: "Chômage en baisse", icon: "briefcase", ok: (i) => i.chomage < 7.5, near: (i) => i.chomage < 8.5 },
  { id: "cohesion", label: "Société apaisée", icon: "users-group", ok: (i) => i.cohesion >= 55, near: (i) => i.cohesion >= 40 },
];

// Victoires intermédiaires débloquées une année donnée (renforcement positif)
function victoires(before, after) {
  const v = [];
  if (after.solde >= 0 && before.solde < 0) v.push({ icon: "award", label: "Budget à l'équilibre, voire en excédent — exploit historique !" });
  else if (after.solde > -3 && before.solde <= -3) v.push({ icon: "trophy", label: "Déficit sous les 3 % — critère européen respecté !" });
  if (after.dette < before.dette) v.push({ icon: "trending-down", label: "La dette recule cette année." });
  if (after.chomage < 7 && before.chomage >= 7) v.push({ icon: "briefcase", label: "Chômage repassé sous 7 % !" });
  if (after.croissance > 2) v.push({ icon: "rocket", label: `Forte croissance (${fmt(after.croissance, 1)} %) !` });
  if (after.cohesion >= 70 && before.cohesion < 70) v.push({ icon: "heart", label: "Société très apaisée." });
  if (after.integrite >= 80 && before.integrite < 80) v.push({ icon: "shield-check", label: "Exemplarité : mains propres." });
  if (after.environnement >= 65 && before.environnement < 65) v.push({ icon: "leaf", label: "Belle avancée écologique." });
  return v;
}

/* ---- 16 LEVIERS. Chiffres 2025 (arrondis, DGFiP/INSEE) ----
   cat  : 'rec' (recette) | 'dep' (dépense)
   eur0 : montant de base en Md€ (recette perçue ou budget du poste)
   eurStep : Md€ ajoutés par cran (réaliste)
   rate0 / rateStep / unit : taux affiché (null si pas de taux simple)
   mult : multiplicateur budgétaire (effet demande)
   fx   : effets par cran sur les jauges "douces" (appliqués au CHANGEMENT de l'année)
   cho / cro : effets structurels directs par cran sur chômage / croissance
*/
const LEVERS = [
  // ---------------- RECETTES ----------------
  { id: "tva", cat: "rec", label: "TVA", icon: "shopping-cart",
    eur0: 211, eurStep: 10.5, rate0: 20, rateStep: 1, unit: "%", mult: 0.5,
    fx: { popularite: -2, cohesion: -2 },
    hint: "Impôt sur la consommation. Rapporte beaucoup mais régressif (pèse plus sur les modestes)." },
  { id: "ir", cat: "rec", label: "Impôt sur le revenu (barème progressif)", icon: "user-dollar",
    eur0: 95, eurStep: 6, rate0: 45, rateStep: 3, unit: "% (tranche haute)", mult: 0.35,
    fx: { popularite: -3, cohesion: 1 },
    hint: "Progressif : les hauts revenus paient proportionnellement plus. Redistributif mais impopulaire." },
  { id: "csg", cat: "rec", label: "CSG (proportionnelle)", icon: "receipt",
    eur0: 130, eurStep: 7, rate0: 9.2, rateStep: 0.5, unit: "%", mult: 0.4,
    fx: { popularite: -2, cohesion: -1 },
    hint: "Prélèvement au taux unique sur presque tous les revenus. Rapporte beaucoup, peu progressif." },
  { id: "is", cat: "rec", label: "Impôt sur les sociétés (IS)", icon: "building-skyscraper",
    eur0: 58, eurStep: 2.3, rate0: 25, rateStep: 1, unit: "%", mult: 0.45,
    fx: { popularite: 0 }, cho: 0.05,
    hint: "Taxe les bénéfices des entreprises. Trop haut, il nuit à la compétitivité et à l'investissement." },
  { id: "cotpat", cat: "rec", label: "Cotisations patronales", icon: "briefcase",
    eur0: 380, eurStep: 11, rate0: 42, rateStep: 1.5, unit: "% du brut", mult: 0.6,
    fx: { popularite: -1 }, cho: 0.13,
    hint: "Financent la Sécu. Poste énorme, mais toute hausse renchérit le coût du travail (chômage)." },
  { id: "cotsal", cat: "rec", label: "Cotisations salariales", icon: "wallet",
    eur0: 230, eurStep: 7, rate0: 22, rateStep: 1, unit: "%", mult: 0.45,
    fx: { popularite: -2, cohesion: -1 },
    hint: "Prélevées sur le salaire : toute hausse réduit le salaire net et le pouvoir d'achat." },
  { id: "patrimoine", cat: "rec", label: "Fiscalité du patrimoine (ISF, successions, IFI)", icon: "diamond",
    eur0: 90, eurStep: 9, rate0: null, unit: "", mult: 0.4,
    fx: { popularite: 1, cohesion: 2 }, cro: -0.04,
    hint: "Frappe le capital et les héritages : très redistributif, mais risque d'exil des grandes fortunes." },
  { id: "ecolo", cat: "rec", label: "Fiscalité écologique (TICPE, taxe carbone)", icon: "gas-station",
    eur0: 45, eurStep: 4.5, rate0: null, unit: "", mult: 0.5,
    fx: { popularite: -2, cohesion: -1, environnement: 2 },
    hint: "Taxe l'énergie et le carbone. Incite à la transition mais peut déclencher une révolte fiscale." },
  // ---------------- DÉPENSES ----------------
  { id: "retraites", cat: "dep", label: "Retraites", icon: "old",
    eur0: 340, eurStep: 7, rate0: null, unit: "", mult: 1.1,
    fx: { popularite: 3, cohesion: 2 },
    hint: "Le premier poste de dépense. Toute baisse (âge, montant) est explosive politiquement." },
  { id: "sante", cat: "dep", label: "Santé / Hôpital", icon: "heartbeat",
    eur0: 300, eurStep: 6, rate0: null, unit: "", mult: 1.0,
    fx: { popularite: 2, cohesion: 2 },
    hint: "Sous-investir crée des déserts médicaux et sature les urgences ; coût social différé élevé." },
  { id: "education", cat: "dep", label: "Éducation", icon: "school",
    eur0: 141, eurStep: 4, rate0: null, unit: "", mult: 1.0,
    fx: { popularite: 1, cohesion: 2 }, cho: -0.04,
    hint: "Investissement dans le capital humain : rendement de long terme sur la croissance potentielle." },
  { id: "aides", cat: "dep", label: "Aides & minima sociaux (RSA, APL, prime d'activité)", icon: "heart-handshake",
    eur0: 70, eurStep: 5, rate0: null, unit: "", mult: 1.3,
    fx: { popularite: 2, cohesion: 3 },
    hint: "Fort multiplicateur : versées à des ménages modestes, elles sont presque entièrement dépensées." },
  { id: "invest", cat: "dep", label: "Investissement & recherche (écologie, infra, R&D)", icon: "bulb",
    eur0: 90, eurStep: 5, rate0: null, unit: "", mult: 1.4,
    fx: { popularite: 1, environnement: 2 }, cro: 0.12, cho: -0.08,
    hint: "Le plus fort multiplicateur : dope la croissance de demain, mais rapporte peu tout de suite." },
  { id: "defense", cat: "dep", label: "Défense & souveraineté", icon: "shield",
    eur0: 50, eurStep: 4, rate0: null, unit: "", mult: 1.1,
    fx: { popularite: 1, cohesion: 1 }, cro: 0.03,
    hint: "Souveraineté et emplois industriels. Coûteux, effet d'entraînement sur l'industrie." },
  { id: "securite", cat: "dep", label: "Sécurité & Justice", icon: "scale",
    eur0: 48, eurStep: 3, rate0: null, unit: "", mult: 0.9,
    fx: { popularite: 1, cohesion: 1 },
    hint: "Ordre public et justice. Rassure l'opinion ; un excès purement répressif peut tendre la société." },
  { id: "fonction", cat: "dep", label: "Masse salariale & effectifs (non-remplacement des départs)", icon: "building-community",
    eur0: 150, eurStep: 5, rate0: null, unit: "", mult: 0.8,
    fx: { popularite: 1, cohesion: 1 }, cho: -0.06,
    hint: "Traitements des fonctionnaires. Ne pas remplacer les départs en retraite économise gros, mais réduit l'emploi public et le service rendu (idée Retailleau/Lisnard)." },
  { id: "agences", cat: "dep", label: "Agences & opérateurs de l'État", icon: "building-cog",
    eur0: 30, eurStep: 3, rate0: null, unit: "", mult: 0.7,
    fx: { popularite: -1, cohesion: 0.5, environnement: 1 }, cho: -0.03,
    hint: "Fusionner ou supprimer les doublons (ADEME, ARS…). Couper plaît à l'opinion mais désorganise certaines missions (santé, écologie)." },
  { id: "subventions", cat: "dep", label: "Subventions (entreprises & associations)", icon: "gift",
    eur0: 45, eurStep: 4, rate0: null, unit: "", mult: 0.7,
    fx: { cohesion: 1, popularite: 0.5 }, cro: 0.05,
    hint: "Aides aux entreprises et aux associations. Les raboter économise vite, mais freine l'activité et le tissu associatif." },
  { id: "collectivites", cat: "dep", label: "Dotations aux collectivités locales", icon: "map-pin",
    eur0: 50, eurStep: 4, rate0: null, unit: "", mult: 1.0,
    fx: { cohesion: 1, popularite: 1 }, cro: 0.05, cho: -0.03,
    hint: "Les collectivités portent ~70 % de l'investissement public. Baisser leurs dotations économise, mais réduit services locaux et investissement." },
];

// Helpers d'affichage : montant et taux courants d'un levier selon son niveau cumulé
const levEur = (lev, level) => Math.max(0, lev.eur0 + (level || 0) * lev.eurStep);
const levRate = (lev, level) => (lev.rate0 == null ? null : lev.rate0 + (level || 0) * lev.rateStep);

/* ---- Doctrines de départ (inspirées de vrais modèles) ---- */
const DOCTRINES = [
  { id: "rigueur", label: "Rigueur budgétaire", ref: "façon Argentine de Milei", icon: "scissors", color: "#F19A9A",
    desc: "Réduire la dépense et la dette avant tout. Les marchés vous font confiance, la société est plus fragile.",
    effet: "La dette pèse moins sur la croissance, mais la cohésion est plus difficile à tenir.",
    mod: { dragRelief: 0.4 } },
  { id: "solidarite", label: "Solidarité & écologie", ref: "modèle nordique / Lula", icon: "seeding", color: "#8FD1B0",
    desc: "Services publics étendus et transition écologique, financés par l'impôt. Cohésion forte, dette à surveiller.",
    effet: "Les dépenses sociales et d'éducation renforcent davantage la cohésion.",
    mod: { socialBonus: 1.4 } },
  { id: "competitivite", label: "Compétitivité libérale", ref: "façon Macron / Irlande", icon: "rocket", color: "#F4C64A",
    desc: "Baisser les impôts des entreprises pour attirer l'activité. Croissance dopée, recettes à reconstruire.",
    effet: "L'investissement et les baisses de charges dopent plus fortement la croissance.",
    mod: { growthBonus: 1.35 } },
  { id: "souverainete", label: "Souveraineté nationale", ref: "protectionnisme", icon: "flag", color: "#6F94C9",
    desc: "Priorité à l'industrie, la défense et les frontières. Populaire, mais tensions avec les partenaires.",
    effet: "Les dépenses de défense rapportent davantage en popularité et en activité.",
    mod: { defenseBonus: 1.4 } },
];

/* ============================================================
   ÉVÉNEMENTS — ~28 cartes typées, 3 tirées par an.
   type : crise / social / international / opportunite / lobby / ethique / sante / climat
   fx : deltas appliqués immédiatement aux indicateurs.
   note : bulle "le saviez-vous" (notion STMG).
   ============================================================ */
const TYPES = {
  crise: { label: "Crise", color: "#F19A9A", icon: "ti-alert-triangle" },
  social: { label: "Social", color: "#F4C64A", icon: "ti-users-group" },
  international: { label: "International", color: "#6F94C9", icon: "ti-world" },
  opportunite: { label: "Opportunité", color: "#8FD1B0", icon: "ti-sparkles" },
  lobby: { label: "Lobby", color: "#B57BA6", icon: "ti-briefcase" },
  ethique: { label: "Dilemme éthique", color: "#E0A96D", icon: "ti-scale" },
  sante: { label: "Santé", color: "#7FB0C9", icon: "ti-heartbeat" },
  climat: { label: "Climat", color: "#8FBF7F", icon: "ti-temperature-sun" },
};

const EVENTS = [
  { id: "canicule", type: "climat", title: "Canicule exceptionnelle", minor: true,
    desc: "Un dôme de chaleur s'installe. Hôpitaux saturés, écoles fermées, personnes âgées en danger.",
    choices: [
      { label: "Plan canicule d'urgence (climatiseurs, hôpitaux)", fx: { solde: -0.1, popularite: 4, cohesion: 3 }, note: "Dépense publique conjoncturelle : une réponse rapide protège la population mais creuse le déficit ponctuel." },
      { label: "Recommandations et gratuité des transports", fx: { popularite: 1, environnement: 1 }, note: "Réponse peu coûteuse mais jugée timide en cas de drame." },
      { label: "Ne rien débloquer de spécial", fx: { popularite: -5, cohesion: -3 }, note: "L'inaction face à un risque sanitaire coûte cher en popularité." },
    ] },
  { id: "cyberpanne", type: "crise", title: "Cyberattaque sur les services publics", minor: true,
    desc: "Une attaque paralyse les impôts, l'assurance maladie et plusieurs hôpitaux.",
    choices: [
      { label: "Investir massivement en cybersécurité", fx: { solde: -0.2, croissance: 0.05, integrite: 3 }, note: "L'investissement immatériel (sécurité, numérique) protège l'économie et la confiance." },
      { label: "Payer discrètement la rançon", fx: { solde: -0.1, integrite: -8, popularite: 2 }, note: "Solution rapide mais qui encourage le crime et fragilise l'État de droit." },
      { label: "Gérer avec les moyens du bord", fx: { popularite: -3, croissance: -0.1 }, note: "Sous-investir dans la protection expose à des pertes économiques répétées." },
    ] },
  { id: "pandemie", type: "sante", title: "Épidémie virale mondiale",
    desc: "Un nouveau virus se propage. Faut-il confiner l'économie pour sauver des vies ?",
    choices: [
      { label: "Confinement strict + « quoi qu'il en coûte »", fx: { solde: -2.5, dette: 6, chomage: 1.2, croissance: -2.5, popularite: 3, cohesion: 2 }, note: "Choc majeur : l'État soutient l'économie par la dette (chômage partiel, aides). Effet de stabilisateur automatique." },
      { label: "Restrictions ciblées, économie ouverte", fx: { solde: -0.8, croissance: -0.8, popularite: -4, cohesion: -4, chomage: 0.4 }, note: "Arbitrage santé/économie : préserver le PIB peut coûter des vies et diviser le pays." },
      { label: "Laisser circuler, immunité collective", fx: { croissance: -0.3, popularite: -10, cohesion: -6, integrite: -5 }, note: "Un choix radical au coût humain et politique très élevé." },
    ] },
  { id: "energie", type: "crise", title: "Flambée des prix de l'énergie",
    desc: "Une guerre à l'étranger fait doubler le gaz. Ménages et entreprises étranglés.",
    choices: [
      { label: "Bouclier tarifaire financé par l'État", fx: { solde: -1.2, dette: 2, popularite: 6, cohesion: 3 }, note: "Subventionner les prix protège le pouvoir d'achat mais coûte des dizaines de Md€." },
      { label: "Chèque énergie ciblé sur les modestes", fx: { solde: -0.4, popularite: 2, cohesion: 4 }, note: "Une aide ciblée est moins chère qu'une aide universelle, à budget contraint." },
      { label: "Accélérer les renouvelables et la sobriété", fx: { solde: -0.3, croissance: -0.1, environnement: 6, popularite: -2 }, note: "Réponse structurelle : réduit la dépendance à long terme, mais ne soulage pas tout de suite." },
    ] },
  { id: "gilets", type: "social", title: "Mouvement social contre une taxe",
    desc: "Une nouvelle taxe carbone sur les carburants déclenche des blocages dans tout le pays.",
    choices: [
      { label: "Retirer la taxe", fx: { solde: -0.5, popularite: 5, cohesion: 4, environnement: -4, integrite: -2 }, note: "Reculer apaise la rue mais affaiblit la crédibilité de l'action climatique." },
      { label: "Maintenir + redistribuer les recettes", fx: { popularite: -3, cohesion: -2, environnement: 3 }, note: "La fiscalité écologique est mieux acceptée si son produit est redistribué (justice fiscale)." },
      { label: "Maintenir et réprimer les blocages", fx: { popularite: -8, cohesion: -8, integrite: -4 }, note: "La fermeté peut dégénérer et abîmer durablement la cohésion sociale." },
    ] },
  { id: "retraites", type: "social", title: "Réforme des retraites",
    desc: "Le système de retraite est déficitaire. Reporter l'âge de départ ferait économiser gros.",
    choices: [
      { label: "Reporter l'âge de départ à 64 ans", fx: { solde: 1.0, dette: -1, popularite: -9, cohesion: -6 }, note: "Réforme structurelle : améliore durablement les comptes mais très impopulaire." },
      { label: "Augmenter les cotisations à la place", fx: { solde: 0.5, croissance: -0.1, chomage: 0.1, popularite: -3 }, note: "Autre levier d'équilibre : peser sur le travail plutôt que sur l'âge." },
      { label: "Ne rien changer", fx: { solde: -0.6, dette: 1, popularite: 3 }, note: "Le statu quo laisse filer un déficit qui pèsera sur les générations futures." },
    ] },
  { id: "attentat", type: "crise", title: "Attentat terroriste",
    desc: "Une attaque frappe une grande ville. Le pays est sous le choc et exige des réponses.",
    choices: [
      { label: "Plan sécurité massif + état d'urgence", fx: { solde: -0.4, popularite: 6, cohesion: 2, integrite: -3 }, note: "Sécurité vs libertés : un arbitrage démocratique délicat en temps de crise." },
      { label: "Renforcer le renseignement discrètement", fx: { solde: -0.2, popularite: 2, integrite: 1 }, note: "Réponse mesurée, moins spectaculaire mais souvent plus efficace." },
      { label: "Appeler à l'unité sans mesures fortes", fx: { popularite: -4, cohesion: -3 }, note: "L'opinion attend des actes concrets après un traumatisme collectif." },
    ] },
  { id: "delocalisation", type: "crise", title: "Menace de délocalisation",
    desc: "Un grand groupe industriel menace de fermer une usine et de partir à l'étranger.",
    choices: [
      { label: "Verser des aides pour la retenir", fx: { solde: -0.4, chomage: -0.2, popularite: 3, integrite: -3 }, note: "Aider une entreprise privée par l'argent public : efficace mais discutable (aléa moral)." },
      { label: "Négocier une reconversion du site", fx: { solde: -0.2, chomage: 0.1, croissance: 0.1, environnement: 2 }, note: "Accompagner la transition industrielle plutôt que subventionner l'existant." },
      { label: "Laisser jouer le marché", fx: { chomage: 0.4, popularite: -6, cohesion: -4 }, note: "Le libéralisme assume les fermetures ; le coût social local peut être lourd." },
    ] },
  { id: "krach", type: "crise", title: "Krach boursier & panique bancaire",
    desc: "Les marchés s'effondrent, une grande banque vacille. Le risque systémique menace.",
    choices: [
      { label: "Renflouer la banque avec l'argent public", fx: { solde: -1.5, dette: 4, croissance: 0.3, popularite: -5, integrite: -4 }, note: "Sauver les banques évite l'effondrement mais fait payer le contribuable pour le privé (2008)." },
      { label: "Garantir les dépôts, laisser les actionnaires perdre", fx: { solde: -0.5, dette: 1, popularite: 3, croissance: -0.2 }, note: "Protéger les épargnants sans sauver les actionnaires : plus juste, plus risqué." },
      { label: "Ne pas intervenir", fx: { croissance: -1.5, chomage: 0.8, popularite: -6, cohesion: -3 }, note: "La non-intervention peut transformer une crise financière en dépression." },
    ] },
  { id: "guerre", type: "international", title: "Guerre aux portes de l'Europe",
    desc: "Un conflit majeur éclate. Alliés et opinion demandent un engagement de la France.",
    choices: [
      { label: "Aide militaire et accueil de réfugiés", fx: { solde: -0.8, dette: 1, popularite: -2, cohesion: -2, integrite: 4 }, note: "La solidarité internationale a un coût budgétaire et social immédiat." },
      { label: "Aide humanitaire seulement", fx: { solde: -0.3, popularite: 1, integrite: 1 }, note: "Position prudente, parfois jugée insuffisante par les alliés." },
      { label: "Rester neutre", fx: { popularite: -3, integrite: -4, croissance: 0.1 }, note: "La neutralité protège le budget mais isole diplomatiquement." },
    ] },
  { id: "ia", type: "opportunite", title: "Révolution de l'intelligence artificielle",
    desc: "Une vague technologique bouleverse l'économie. Emplois menacés, gains de productivité énormes.",
    choices: [
      { label: "Grand plan de formation & régulation", fx: { solde: -0.5, croissance: 0.4, chomage: -0.3, popularite: 2 }, note: "Accompagner le progrès technique (formation) transforme une menace en gain de productivité." },
      { label: "Laisser le marché s'adapter seul", fx: { croissance: 0.6, chomage: 0.5, cohesion: -4 }, note: "La croissance sans redistribution peut creuser les inégalités (destruction créatrice)." },
      { label: "Taxer les robots pour financer les perdants", fx: { solde: 0.4, croissance: -0.1, cohesion: 3, popularite: 1 }, note: "Idée débattue : redistribuer les gains de l'automatisation vers les emplois détruits." },
    ] },
  { id: "gisement", type: "opportunite", title: "Découverte d'un gisement stratégique",
    desc: "D'importantes ressources (lithium, gaz) sont découvertes sur le territoire.",
    choices: [
      { label: "Exploitation nationale rapide", fx: { solde: 0.8, croissance: 0.5, environnement: -8, popularite: 3 }, note: "Une manne budgétaire immédiate, au prix d'un coût environnemental." },
      { label: "Exploitation encadrée et écologique", fx: { solde: 0.3, croissance: 0.2, environnement: -2, integrite: 3 }, note: "Concilier ressource et environnement : plus lent, plus soutenable." },
      { label: "Laisser dans le sol (sanctuariser)", fx: { environnement: 5, popularite: -2, croissance: -0.1 }, note: "Renoncer à une ressource au nom du climat : un choix de long terme assumé." },
    ] },
  { id: "jo", type: "opportunite", title: "Organisation des Jeux Olympiques",
    desc: "La France accueille les JO. Vitrine mondiale mais budget colossal.",
    choices: [
      { label: "Grand jeu : infrastructures et prestige", fx: { solde: -0.8, dette: 1, croissance: 0.4, popularite: 6, cohesion: 3 }, note: "Les grands événements dopent l'activité et la fierté nationale, mais dérapent souvent en coûts." },
      { label: "Version sobre et maîtrisée", fx: { solde: -0.2, croissance: 0.2, popularite: 3, environnement: 2 }, note: "Maîtriser la dépense publique tout en profitant de la vitrine." },
      { label: "Renoncer", fx: { popularite: -4, croissance: -0.1 }, note: "Éviter le risque budgétaire mais manquer une occasion de rayonnement." },
    ] },
  { id: "greve", type: "social", title: "Grève générale des services publics",
    desc: "Enseignants, soignants et cheminots débrayent ensemble pour les salaires.",
    choices: [
      { label: "Revaloriser les salaires publics", fx: { solde: -0.9, popularite: 4, cohesion: 5, chomage: -0.05 }, note: "La masse salariale publique est un poste majeur ; la hausse soutient la demande." },
      { label: "Prime exceptionnelle ponctuelle", fx: { solde: -0.3, popularite: 2, cohesion: 1 }, note: "Une prime coûte moins qu'une hausse pérenne du point d'indice." },
      { label: "Tenir bon, aucun geste", fx: { popularite: -6, cohesion: -5, croissance: -0.2 }, note: "Un conflit long désorganise l'économie et abîme le climat social." },
    ] },
  { id: "banlieues", type: "social", title: "Émeutes urbaines",
    desc: "Un drame déclenche des nuits d'émeutes. Commerces brûlés, tension à son comble.",
    choices: [
      { label: "Plan pour les quartiers (emploi, écoles)", fx: { solde: -0.6, cohesion: 5, popularite: 1, chomage: -0.1 }, note: "S'attaquer aux causes (chômage, services) plutôt qu'aux symptômes." },
      { label: "Rétablir l'ordre par la force", fx: { popularite: 3, cohesion: -6, integrite: -3 }, note: "La réponse sécuritaire calme à court terme mais nourrit le ressentiment." },
      { label: "Les deux : fermeté + investissement", fx: { solde: -0.4, popularite: 2, cohesion: 1 }, note: "Combiner ordre et justice sociale : équilibre difficile mais souvent nécessaire." },
    ] },
  { id: "secheresse", type: "climat", title: "Sécheresse et crise agricole", minor: true,
    desc: "Les récoltes s'effondrent. Les agriculteurs manifestent, les prix alimentaires grimpent.",
    choices: [
      { label: "Indemniser les agriculteurs", fx: { solde: -0.4, popularite: 3, cohesion: 2 }, note: "Soutenir un secteur sinistré ; les aides agricoles sont un enjeu politique fort." },
      { label: "Investir dans l'irrigation durable", fx: { solde: -0.3, environnement: 3, croissance: 0.1 }, note: "Adapter l'agriculture au changement climatique (investissement structurel)." },
      { label: "Laisser le marché ajuster les prix", fx: { cohesion: -3, popularite: -4 }, note: "La hausse des prix alimentaires frappe d'abord les plus pauvres (inflation)." },
    ] },
  { id: "inflation", type: "crise", title: "Poussée d'inflation",
    desc: "Les prix s'envolent, le pouvoir d'achat recule. La colère monte.",
    choices: [
      { label: "Indexer les aides et le SMIC sur l'inflation", fx: { solde: -0.7, cohesion: 4, popularite: 4, croissance: 0.1 }, note: "Protéger le pouvoir d'achat soutient la demande mais peut entretenir l'inflation (boucle prix-salaires)." },
      { label: "Blocage temporaire de certains prix", fx: { solde: -0.3, popularite: 3, croissance: -0.2, integrite: -1 }, note: "Le contrôle des prix soulage à court terme mais crée des pénuries s'il dure." },
      { label: "Laisser la banque centrale agir (taux)", fx: { croissance: -0.4, chomage: 0.3, popularite: -3 }, note: "La hausse des taux calme l'inflation en freinant l'activité (arbitrage de la BCE)." },
    ] },
  { id: "hopital", type: "sante", title: "Hôpital public au bord de la rupture", minor: true,
    desc: "Manque de lits, soignants épuisés, urgences saturées.",
    choices: [
      { label: "Plan d'investissement hospitalier", fx: { solde: -0.7, cohesion: 4, popularite: 4 }, note: "La santé est un poste majeur ; sous-investir a un coût social et sanitaire différé." },
      { label: "Réorganiser sans dépenser plus", fx: { cohesion: -1, popularite: -1, croissance: 0.05 }, note: "L'efficience à moyens constants a des limites face à la demande de soins." },
      { label: "Ouvrir au privé", fx: { solde: 0.2, cohesion: -4, integrite: -2, popularite: -2 }, note: "La privatisation de la santé divise : gains d'efficacité vs égalité d'accès." },
    ] },
  /* ---- LOBBIES ---- */
  { id: "lobby_energie", type: "lobby", title: "Le lobby de l'énergie propose un pacte",
    desc: "Un géant des hydrocarbures propose d'investir 10 Md€ dans le pays… contre l'autorisation d'un projet controversé et un financement de votre communication.",
    choices: [
      { label: "Accepter le pacte", fx: { solde: 0.3, croissance: 0.4, chomage: -0.2, environnement: -8, integrite: -10 }, note: "Un lobby échange des emplois contre des faveurs ; l'intégrité de la décision publique est en jeu." },
      { label: "Négocier des contreparties écologiques", fx: { solde: 0.1, croissance: 0.2, environnement: -2, integrite: -2 }, note: "Encadrer un lobby plutôt que céder : préserver l'intérêt général." },
      { label: "Refuser fermement", fx: { croissance: -0.1, integrite: 5, popularite: -1 }, note: "Résister aux groupes de pression renforce la confiance démocratique à long terme." },
    ] },
  { id: "lobby_pharma", type: "lobby", title: "Lobby pharmaceutique",
    desc: "Un laboratoire propose un vaccin stratégique à prix fort, en échange d'un brevet exclusif et d'un allègement fiscal.",
    choices: [
      { label: "Signer le contrat exclusif", fx: { solde: -0.5, cohesion: 2, integrite: -6, popularite: 2 }, note: "Dépendre d'un monopole privé pour la santé publique pose un problème de souveraineté." },
      { label: "Exiger une licence ouverte", fx: { solde: -0.2, cohesion: 3, integrite: 3 }, note: "Défendre le bien commun face aux intérêts privés (santé = bien public)." },
      { label: "Financer un vaccin public", fx: { solde: -0.6, croissance: 0.1, integrite: 4, environnement: 0 }, note: "L'investissement public dans la recherche réduit la dépendance, à un coût initial élevé." },
    ] },
  { id: "lobby_agro", type: "lobby", title: "Lobby agro-industriel",
    desc: "La filière demande de réautoriser un pesticide interdit pour « sauver les récoltes ». Elle finance de nombreux emplois ruraux.",
    choices: [
      { label: "Réautoriser le pesticide", fx: { solde: 0.2, chomage: -0.1, environnement: -7, integrite: -6, popularite: 1 }, note: "Céder à un lobble contre l'avis scientifique : un classique du conflit intérêt/santé publique." },
      { label: "Aider la filière à se convertir au bio", fx: { solde: -0.4, environnement: 5, integrite: 3, croissance: 0.05 }, note: "Transition agro-écologique : coûteuse mais durable." },
      { label: "Maintenir l'interdiction sans aide", fx: { chomage: 0.1, cohesion: -2, popularite: -2 }, note: "Défendre l'environnement sans accompagnement social crée des perdants." },
    ] },
  { id: "lobby_finance", type: "lobby", title: "Lobby financier",
    desc: "Les banques demandent une déréglementation pour « libérer le crédit et la croissance ».",
    choices: [
      { label: "Dérèglementer largement", fx: { croissance: 0.5, solde: 0.2, integrite: -6, cohesion: -3 }, note: "La déréglementation dope l'activité mais augmente le risque de crise (leçon de 2008)." },
      { label: "Assouplir à la marge, garder les garde-fous", fx: { croissance: 0.2, integrite: -1 }, note: "Chercher l'équilibre entre financement de l'économie et stabilité financière." },
      { label: "Refuser et renforcer la supervision", fx: { croissance: -0.1, integrite: 4, cohesion: 1 }, note: "Réguler la finance protège l'économie réelle des excès spéculatifs." },
    ] },
  /* ---- DILEMMES ÉTHIQUES ---- */
  { id: "ethique_data", type: "ethique", title: "Surveillance de masse",
    desc: "Vos services proposent un système de surveillance généralisée qui réduirait la criminalité… au prix des libertés.",
    choices: [
      { label: "Déployer la surveillance", fx: { popularite: 3, cohesion: -3, integrite: -8 }, note: "Sécurité contre libertés : un dilemme fondamental des démocraties." },
      { label: "Version encadrée par un juge", fx: { popularite: 1, integrite: -1 }, note: "Le contrôle judiciaire protège l'État de droit tout en gardant un outil de sécurité." },
      { label: "Renoncer au dispositif", fx: { integrite: 4, popularite: -2 }, note: "Préserver les libertés a parfois un coût politique immédiat." },
    ] },
  { id: "ethique_emploi", type: "ethique", title: "Un proche pour un poste clé",
    desc: "Un allié politique vous demande de nommer une personne peu qualifiée à un poste public important.",
    choices: [
      { label: "Accepter la nomination", fx: { popularite: 1, integrite: -9, cohesion: -2 }, note: "Le favoritisme (clientélisme) mine la confiance dans l'action publique." },
      { label: "Proposer un poste secondaire", fx: { integrite: -3 }, note: "Un compromis qui limite les dégâts sans totalement résister." },
      { label: "Refuser au nom du mérite", fx: { integrite: 5, popularite: -3 }, note: "Défendre l'intégrité peut coûter des soutiens politiques." },
    ] },
  { id: "ethique_scandale", type: "ethique", title: "Un scandale menace d'éclater",
    desc: "Un journaliste enquête sur un marché public douteux signé par votre équipe.",
    choices: [
      { label: "Étouffer l'affaire", fx: { popularite: 2, integrite: -12 }, note: "Dissimuler aggrave la faute ; en démocratie, la transparence protège mieux que le secret." },
      { label: "Reconnaître et réparer publiquement", fx: { popularite: -4, integrite: 6, cohesion: 2 }, note: "L'aveu et la réparation restaurent la confiance à moyen terme." },
      { label: "Ouvrir une enquête indépendante", fx: { popularite: -2, integrite: 4 }, note: "Confier le contrôle à un tiers indépendant renforce la crédibilité." },
    ] },
  /* ---- INTERNATIONAL / DIVERS ---- */
  { id: "ue", type: "international", title: "Bras de fer avec l'Union européenne",
    desc: "Bruxelles exige de réduire votre déficit sous peine de sanctions.",
    choices: [
      { label: "Respecter la règle des 3 %", fx: { solde: 1.2, croissance: -0.3, popularite: -5, cohesion: -3 }, note: "Le Pacte de stabilité impose déficit < 3 % du PIB : la discipline budgétaire a un coût social." },
      { label: "Négocier un délai", fx: { solde: 0.3, popularite: 1, integrite: 1 }, note: "La négociation européenne permet d'étaler l'effort budgétaire." },
      { label: "Ignorer et assumer les sanctions", fx: { dette: 2, popularite: 3, integrite: -3, croissance: 0.1 }, note: "Défier l'UE plaît parfois à l'opinion mais isole et coûte en crédibilité." },
    ] },
  { id: "migration", type: "international", title: "Crise migratoire",
    desc: "Des milliers de personnes arrivent aux frontières. Le pays se divise sur la conduite à tenir.",
    choices: [
      { label: "Accueil organisé et intégration", fx: { solde: -0.5, cohesion: -2, integrite: 4, croissance: 0.1 }, note: "L'immigration a un coût d'intégration initial et un apport économique de long terme." },
      { label: "Quotas et contrôle renforcé", fx: { solde: -0.2, popularite: 3, cohesion: -1 }, note: "Une politique d'équilibre, souvent critiquée des deux bords." },
      { label: "Fermeture des frontières", fx: { popularite: 4, cohesion: -4, integrite: -4, croissance: -0.1 }, note: "Le repli séduit une part de l'opinion mais heurte les engagements humanitaires." },
    ] },
  { id: "basezero", type: "opportunite", title: "Réviser toutes les dépenses (budget base zéro)",
    desc: "Vos conseillers proposent d'arrêter de reconduire automatiquement les budgets : chaque dépense devrait être justifiée à partir de zéro, chaque année.",
    choices: [
      { label: "Appliquer le budget base zéro à tout l'État", fx: { solde: 0.4, popularite: -2, cohesion: -1, integrite: 2 }, note: "Le « base zéro » force à justifier chaque euro : fort potentiel d'économies, mais lourd à mettre en œuvre et source de conflits avec les administrations." },
      { label: "Audit ciblé sur les plus gros postes", fx: { solde: 0.15, integrite: 1 }, note: "Un audit partiel : des économies plus modestes, mais plus consensuelles et rapides." },
      { label: "Reconduire les budgets comme d'habitude", fx: { solde: -0.1 }, note: "La reconduction automatique (base historique) est simple mais laisse filer les dépenses devenues inefficaces." },
    ] },
  { id: "tech", type: "opportunite", title: "Champion industriel à soutenir",
    desc: "Une entreprise nationale peut devenir leader mondial des batteries si l'État investit.",
    choices: [
      { label: "Investir dans le champion national", fx: { solde: -0.6, croissance: 0.4, chomage: -0.2, environnement: 3 }, note: "La politique industrielle parie sur l'avenir : risquée mais potentiellement gagnante." },
      { label: "Prêt garanti seulement", fx: { croissance: 0.2, integrite: 1 }, note: "Soutenir sans dépenser directement (garantie publique)." },
      { label: "Laisser le privé financer", fx: { croissance: 0.1, chomage: 0.1 }, note: "Le non-interventionnisme laisse le risque et les gains au marché." },
    ] },
];

/* ============================================================
   STOCKAGE (classement + sauvegarde) via window.storage
   ============================================================ */
// Stockage local (navigateur). Le classement est propre à chaque poste ;
// voir le README pour une version partagée entre ordinateurs.
const storage = {
  async get(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } },
  async set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; } },
  async del(key) { try { localStorage.removeItem(key); return true; } catch { return false; } },
};
const lbKey = (code) => `quinq:lb:${code.toUpperCase()}`;
const saveKey = (code, team) => `quinq:save:${code.toUpperCase()}:${team}`;

/* ============================================================
   MOTEUR
   ============================================================ */
function applyFx(ind, fx, mult = 1) {
  const n = { ...ind };
  for (const k in fx) n[k] = (n[k] || 0) + fx[k] * mult;
  return clampInd(n);
}
function clampInd(ind) {
  return {
    solde: clamp(ind.solde, -15, 6), dette: clamp(ind.dette, 40, 220),
    chomage: clamp(ind.chomage, 3, 20), croissance: clamp(ind.croissance, -6, 6),
    popularite: clamp(ind.popularite, 0, 100), cohesion: clamp(ind.cohesion, 0, 100),
    integrite: clamp(ind.integrite, 0, 100), environnement: clamp(ind.environnement, 0, 100),
  };
}
function scale(fx, k) { const o = {}; for (const key in fx) o[key] = fx[key] * k; return o; }

// Solde apporté par les NIVEAUX cumulés (persistant : un impôt maintenu rapporte chaque année)
function balanceFromLevels(levels, doctrine) {
  const mod = doctrine?.mod || {};
  let md = 0;
  for (const lev of LEVERS) {
    const lvl = levels[lev.id] || 0;
    if (!lvl) continue;
    let eur = lvl * lev.eurStep;                       // Md€ vs base
    md += lev.cat === "rec" ? eur : -eur;              // recette améliore le solde, dépense le dégrade
  }
  return md;
}

// Début d'année : réinitialise croissance & solde à leur base structurelle
function startYear(indPrev, year, doctrine) {
  const mod = doctrine?.mod || {};
  const dragCoef = 0.012 * (mod.dragRelief ? mod.dragRelief : 1);
  const drag = -dragCoef * Math.max(0, indPrev.dette - 90);
  return { ...indPrev, croissance: 1.0 + drag, solde: -5.0 };
}

// Applique le budget de l'année : solde = base + niveaux ; impulsion = CHANGEMENT de l'année
function applyBudgetYear(indPrev, levels, prevLevels, year, doctrine) {
  const mod = doctrine?.mod || {};
  let ind = startYear(indPrev, year, doctrine);
  const balanceMd = balanceFromLevels(levels, doctrine);
  ind.solde = clamp(ind.solde + balanceMd / SOLDE_DIV, -15, 8);
  let impulse = 0;
  const changes = [];
  for (const lev of LEVERS) {
    const d = (levels[lev.id] || 0) - (prevLevels[lev.id] || 0);   // crans changés cette année
    if (!d) continue;
    changes.push({ lev, d });
    const eurDelta = d * lev.eurStep;
    const impSign = lev.cat === "dep" ? 1 : -1;                    // dépenser stimule, prélever freine
    let gBonus = 1;
    if (mod.growthBonus && (lev.id === "invest" || (lev.id === "is" && d < 0) || (lev.id === "cotpat" && d < 0))) gBonus = mod.growthBonus;
    impulse += impSign * eurDelta * lev.mult * gBonus;
    // effets doux (sur le changement), amplifiés pour que les décisions se ressentent
    let fx = { ...lev.fx };
    if (mod.socialBonus && ["retraites", "sante", "education", "aides"].includes(lev.id)) fx = scale(fx, mod.socialBonus);
    if (mod.defenseBonus && lev.id === "defense") fx = scale(fx, mod.defenseBonus);
    ind = applyFx(ind, scale(fx, d * IMPACT));
    if (lev.cho) ind.chomage = clamp(ind.chomage + lev.cho * d * IMPACT, 3, 20);
    if (lev.cro) ind.croissance = clamp(ind.croissance + lev.cro * d * IMPACT, -6, 6);
  }
  // Effet d'offre : l'investissement et l'éducation accumulés relèvent durablement
  // la croissance potentielle — rendement de long terme, bien visible.
  const supply = Math.min(0.10 * Math.max(0, levels.invest || 0) + 0.06 * Math.max(0, levels.education || 0), 0.8);
  ind.croissance = clamp(ind.croissance + (impulse / PIB) * 100 * IMPULSE_GAIN + supply, -6, 6);
  return { ind: clampInd(ind), balanceMd, impulse, changes };
}

// Clôture : loi d'Okun, dynamique de dette, usure, pénalités
function finalizeYear(ind0) {
  let n = { ...ind0 };
  n.chomage = clamp(n.chomage - 0.35 * (n.croissance - 1.0), 3, 20);
  const nominalG = (n.croissance + 1.3) / 100;
  n.dette = clamp(n.dette + (-n.solde) - n.dette * nominalG, 40, 220);
  n.popularite = clamp(n.popularite - 0.6, 0, 100);      // usure du pouvoir (adoucie)
  n.environnement = clamp(n.environnement - 0.7, 0, 100);
  const flags = [];
  if (n.dette > 130) { n.solde = clamp(n.solde - 0.5, -15, 6); n.popularite = clamp(n.popularite - 3, 0, 100); flags.push("marches"); }
  if (n.dette > 150) { n.croissance = clamp(n.croissance - 0.4, -6, 6); flags.push("defiance"); }
  if (n.cohesion < 25) { n.croissance = clamp(n.croissance - 0.3, -6, 6); n.popularite = clamp(n.popularite - 4, 0, 100); flags.push("emeutes"); }
  if (n.popularite < 22) flags.push("censure");
  if (n.integrite < 30) flags.push("scandale");
  return { ind: clampInd(n), flags };
}

// tirage des 3 événements de l'année
function drawEvents(year, usedIds, flags) {
  const forced = [];
  if (flags?.includes("scandale")) forced.push("ethique_scandale");
  if (flags?.includes("emeutes")) forced.push("banlieues");
  const pool = EVENTS.filter((e) => !usedIds.includes(e.id) && !forced.includes(e.id));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const picks = [];
  for (const id of forced) { const e = EVENTS.find((x) => x.id === id); if (e) picks.push(e); }
  while (picks.length < 3 && shuffled.length) picks.push(shuffled.pop());
  return picks.slice(0, 3);
}

/* ============================================================
   LE CONSEILLER — bilan structuré (éco / social / alerte)
   ============================================================ */
function conseiller(before, after, flags, bigEvent) {
  const d = (k) => after[k] - before[k];
  const up = (k, s = 0.05) => d(k) > s, down = (k, s = 0.05) => d(k) < -s;
  // Économie
  let eco;
  const croiss = after.croissance;
  if (croiss > 1.5) eco = `L'économie accélère (croissance ${fmt(croiss, 1)} %)`;
  else if (croiss < 0.3) eco = `L'activité ralentit (croissance ${fmt(croiss, 1)} %)`;
  else eco = `La croissance reste modérée (${fmt(croiss, 1)} %)`;
  if (down("chomage", 0.1)) eco += `, le chômage recule à ${fmt(after.chomage, 1)} %`;
  else if (up("chomage", 0.1)) eco += `, mais le chômage monte à ${fmt(after.chomage, 1)} %`;
  eco += after.solde < -6 ? `. Le déficit se creuse (${fmt(after.solde, 1)} % du PIB)` : after.solde > -3 ? `. Le déficit est maîtrisé (${fmt(after.solde, 1)} %)` : `. Le déficit reste élevé (${fmt(after.solde, 1)} %)`;
  eco += after.dette > before.dette ? `, la dette grimpe à ${fmt(after.dette, 0)} %.` : `, la dette reflue à ${fmt(after.dette, 0)} %.`;
  // Social
  let social;
  if (up("cohesion", 1)) social = `Côté société, la cohésion se renforce`;
  else if (down("cohesion", 1)) social = `Côté société, les tensions montent`;
  else social = `Le climat social est stable`;
  if (down("popularite", 2)) social += ` et votre popularité s'érode (${fmt(after.popularite, 0)})`;
  else if (up("popularite", 1)) social += ` et l'opinion vous soutient davantage (${fmt(after.popularite, 0)})`;
  else social += ` (popularité ${fmt(after.popularite, 0)})`;
  if (down("environnement", 2)) social += `. L'empreinte écologique se dégrade.`;
  else if (up("environnement", 1)) social += `. Les indicateurs écologiques progressent.`;
  else social += `.`;
  // Alerte
  const alertMap = { marches: "Les marchés financiers s'inquiètent de la dette : les taux d'intérêt montent.", defiance: "Défiance des créanciers : la croissance est bridée par la charge de la dette.", emeutes: "La fracture sociale a dégénéré en émeutes.", censure: "Attention : une motion de censure menace votre gouvernement.", scandale: "Un parfum de scandale entoure votre équipe : l'intégrité est en jeu." };
  const alerte = flags.map((f) => alertMap[f]).filter(Boolean);
  return { eco, social, alerte };
}

/* ============================================================
   SCORING — éco 55 % / social 30 % / politique 15 %
   ============================================================ */
function scoreBreakdown(ind) {
  const sc = (v, lo, hi) => clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
  const choScore = sc(9 - ind.chomage, 9 - 8, 9 - 4.5); // 4,5 % = excellent, 8 % = nul
  const eco = (
    sc(ind.solde, -4, 1) * 0.30 +                  // 0 % = excellent, excédent = parfait
    sc(121 - ind.dette, 121 - 121, 121 - 103) * 0.30 + // faire reculer la dette = récompensé
    choScore * 0.20 +
    sc(ind.croissance, 0.5, 2) * 0.20
  );
  const social = ind.cohesion * 0.5 + ind.environnement * 0.25 + choScore * 0.25;
  const politique = ind.popularite * 0.6 + ind.integrite * 0.4;
  const totalRaw = eco * 0.55 + social * 0.30 + politique * 0.15;
  // Légère courbe de notation (douce) : le barème est déjà atteignable
  const courbe = (x) => Math.round(100 * Math.pow(clamp(x, 0, 100) / 100, 0.8));
  return { eco: courbe(eco), social: courbe(social), politique: courbe(politique), total: courbe(totalRaw) };
}

function ending(ind, sc) {
  if (ind.integrite < 30) return { key: "scandale", title: "Chute sur scandale", icon: "gavel", color: "#B57BA6",
    text: "Miné par les affaires, votre gouvernement tombe avant l'heure. La probité est le socle de la confiance démocratique." };
  if (ind.dette > 150 || ind.solde < -9) return { key: "faillite", title: "Crise budgétaire majeure", icon: "flame", color: "#F19A9A",
    text: "La dette a filé, les marchés ont lâché. Le pays passe sous tutelle budgétaire. Gouverner, c'est d'abord tenir les comptes." };
  if (ind.cohesion < 25) return { key: "chaos", title: "Le pays ingouvernable", icon: "urgent", color: "#E0A96D",
    text: "La fracture sociale a eu raison de votre mandat. Sans cohésion, aucune réforme ne tient." };
  if (ind.popularite >= 48 && sc.total >= 62) return { key: "triomphe", title: "Réélu·e triomphalement", icon: "crown", color: "#F4C64A",
    text: "Comptes tenus, pays apaisé : les électeurs vous renouvellent largement leur confiance. Un quinquennat de référence." };
  // La réélection exige AUSSI un bilan minimal : la seule popularité ne suffit pas.
  if (ind.popularite >= 38 && sc.total >= 40) return { key: "reelu", title: "Réélu·e", icon: "confetti", color: "#8FD1B0",
    text: "Un bilan contrasté, mais suffisant pour l'emporter au second tour. Gouverner, c'est arbitrer." };
  if (sc.total < 40 && ind.popularite >= 38) return { key: "battu", title: "Battu·e malgré votre popularité", icon: "mood-sad", color: "#6F94C9",
    text: "Vous étiez apprécié·e, mais votre bilan (dette, déficit, emploi) était trop faible : les électeurs ont voulu du concret. L'immobilisme ne paie pas." };
  if (ind.popularite >= 28) return { key: "battu", title: "Battu·e au second tour", icon: "mood-sad", color: "#6F94C9",
    text: "Malgré des réformes, l'opinion a préféré tourner la page. Les efforts budgétaires paient rarement à court terme." };
  return { key: "desavoue", title: "Désavoué·e par les urnes", icon: "thumb-down", color: "#F19A9A",
    text: "Le pays a sanctionné votre mandat. L'impopularité des choix a eu le dernier mot." };
}

// Explication dynamique du résultat, à partir du bilan chiffré du mandat
function expliquerFin(game) {
  const h = game.history || [];
  if (!h.length) return "";
  const last = h[h.length - 1].ind;
  const avgSolde = h.reduce((s, r) => s + r.ind.solde, 0) / h.length;
  const detteDelta = last.dette - 116;
  const p = [];
  p.push(`Sur 5 ans, votre déficit moyen a été de ${fmt(avgSolde, 1)} % du PIB`);
  p.push(detteDelta > 2 ? `la dette est passée de 116 % à ${fmt(last.dette, 0)} % (+${fmt(detteDelta, 0)} points)` : detteDelta < -2 ? `la dette a reculé de 116 % à ${fmt(last.dette, 0)} %` : `la dette est restée stable (${fmt(last.dette, 0)} %)`);
  p.push(last.chomage < 7 ? `le chômage a baissé à ${fmt(last.chomage, 1)} %` : last.chomage > 9 ? `le chômage a grimpé à ${fmt(last.chomage, 1)} %` : `le chômage s'établit à ${fmt(last.chomage, 1)} %`);
  if (last.integrite < 40) p.push(`et votre intégrité, entamée (${fmt(last.integrite, 0)}/100), a nourri les scandales`);
  return p.join(", ").replace(/,([^,]*)$/, "$1") + ".";
}

function lessonFor(ind) {
  const L = [];
  if (ind.dette < 118) L.push("tenu la dette"); else if (ind.dette > 135) L.push("laissé filer la dette");
  if (ind.chomage < 7) L.push("fait reculer le chômage"); else if (ind.chomage > 9) L.push("laissé monter le chômage");
  if (ind.cohesion > 60) L.push("préservé la cohésion sociale"); else if (ind.cohesion < 35) L.push("fracturé la société");
  if (ind.integrite < 45) L.push("cédé aux compromissions"); else if (ind.integrite > 75) L.push("gardé les mains propres");
  if (ind.environnement > 60) L.push("investi pour le climat"); else if (ind.environnement < 35) L.push("négligé l'environnement");
  if (!L.length) return "Un mandat sans relief, ni grand succès ni échec marquant.";
  return "Vous avez " + L.slice(0, 3).join(", ") + ".";
}

/* ============================================================
   UI
   ============================================================ */
const C = {
  bg: "#12203A", card: "#182B4C", card2: "#1B2E52", line: "#2C4372",
  gold: "#F4C64A", mint: "#8FD1B0", coral: "#F19A9A",
  ink: "#F6F1E4", sub: "#B7C4DC", dim: "#8CA0C4",
};
const Icon = ({ n, size = 18, color, style }) => (
  <i className={"ti ti-" + n} style={{ fontSize: size, color, lineHeight: 1, ...style }} aria-hidden="true" />
);

// Métadonnées d'affichage des indicateurs
const IND_META = [
  { id: "solde", label: "Solde", icon: "ti-wallet", unit: "%", fmt: (v) => (v > 0 ? "+" : "") + fmt(v, 1), good: (v) => v > -3, bad: (v) => v < -6, grp: "Économie" },
  { id: "dette", label: "Dette", icon: "ti-chart-line", unit: "%", fmt: (v) => fmt(v, 0), good: (v) => v < 110, bad: (v) => v > 130, grp: "Économie" },
  { id: "chomage", label: "Chômage", icon: "ti-briefcase", unit: "%", fmt: (v) => fmt(v, 1), good: (v) => v < 7, bad: (v) => v > 9, grp: "Économie" },
  { id: "croissance", label: "Croissance", icon: "ti-trending-up", unit: "%", fmt: (v) => (v > 0 ? "+" : "") + fmt(v, 1), good: (v) => v > 1.3, bad: (v) => v < 0.3, grp: "Économie" },
  { id: "cohesion", label: "Cohésion", icon: "ti-users-group", unit: "", fmt: (v) => fmt(v, 0), good: (v) => v > 60, bad: (v) => v < 35, grp: "Société" },
  { id: "environnement", label: "Environnement", icon: "ti-leaf", unit: "", fmt: (v) => fmt(v, 0), good: (v) => v > 60, bad: (v) => v < 35, grp: "Société" },
  { id: "popularite", label: "Popularité", icon: "ti-mood-smile", unit: "", fmt: (v) => fmt(v, 0), good: (v) => v > 55, bad: (v) => v < 35, grp: "Politique" },
  { id: "integrite", label: "Intégrité", icon: "ti-scale", unit: "", fmt: (v) => fmt(v, 0), good: (v) => v > 70, bad: (v) => v < 40, grp: "Politique" },
];
const indColor = (m, v) => (m.bad(v) ? C.coral : m.good(v) ? C.mint : C.gold);

function HUD({ ind, prev }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(84px,1fr))", gap: 8 }}>
      {IND_META.map((m) => {
        const v = ind[m.id]; const col = indColor(m, v);
        const d = prev ? v - prev[m.id] : 0;
        const dShow = prev && Math.abs(d) >= 0.05;
        return (
          <div key={m.id} style={{ background: C.card, borderRadius: 10, padding: "8px 9px", border: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: C.dim, fontSize: 10.5, marginBottom: 3 }}>
              <Icon n={m.icon.replace("ti-", "")} size={13} /> {m.label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ color: col, fontFamily: "monospace", fontSize: 17, fontWeight: 600 }}>{m.fmt(v)}<span style={{ fontSize: 10, color: C.dim }}>{m.unit}</span></span>
              {dShow && <span style={{ fontSize: 10, fontFamily: "monospace", color: d > 0 ? C.mint : C.coral }}>{d > 0 ? "▲" : "▼"}{fmt(Math.abs(d), 1)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Btn({ onClick, children, kind = "ghost", disabled, style }) {
  const base = { border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 16px", fontSize: 14, cursor: disabled ? "default" : "pointer", fontWeight: 500, transition: "all .15s", opacity: disabled ? 0.5 : 1 };
  const kinds = {
    primary: { background: C.gold, color: "#12203A", border: "1px solid " + C.gold },
    mint: { background: C.mint, color: "#12203A", border: "1px solid " + C.mint },
    ghost: { background: "transparent", color: C.ink },
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...kinds[kind], ...style }}>{children}</button>;
}

function Note({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 6 }}>
      <button onClick={() => setOpen(!open)} style={{ background: "transparent", border: "none", color: C.gold, fontSize: 11.5, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
        <Icon n="bulb" size={13} /> Le saviez-vous ? {open ? "▲" : "▼"}
      </button>
      {open && <div style={{ marginTop: 5, fontSize: 12, color: C.sub, lineHeight: 1.55, background: "#12203A", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px" }}>{text}</div>}
    </div>
  );
}

/* ---------- Écran d'accueil ---------- */
function Home({ onStart, onResume, onLeaderboard, hasSave }) {
  const [code, setCode] = useState("STMG");
  const [team, setTeam] = useState("");
  const [doc, setDoc] = useState(null);
  const canStart = code.trim() && team.trim() && doc;
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
          <div style={{ width: 56, height: 56, borderRadius: 15, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="building-bank" size={34} color="#12203A" /></div>
          <h1 style={{ margin: 0, color: C.ink, fontFamily: "Fraunces,serif", fontSize: 46, fontWeight: 600 }}>Quinquennat</h1>
        </div>
        <p style={{ color: C.dim, fontSize: 17, margin: 0 }}>À vous de gouverner la France pendant 5 ans. Chaque décision compte.</p>
      </div>

      {/* Guidage : 3 étapes à compléter avant de commencer */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, flexWrap: "wrap", justifyContent: "center" }}>
        {[["Code de classe", !!code.trim()], ["Nom d'équipe", !!team.trim()], ["Doctrine", !!doc]].map(([label, done], i) => (
          <React.Fragment key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: done ? C.mint : C.ink }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, background: done ? C.mint : "transparent", color: done ? "#12203A" : C.dim, border: `1.5px solid ${done ? C.mint : C.line}` }}>
                {done ? "✓" : i + 1}
              </span>
              {label}
            </div>
            {i < 2 && <span style={{ color: C.line }}>→</span>}
          </React.Fragment>
        ))}
      </div>
      <div style={{ textAlign: "center", fontSize: 12, color: C.dim, marginBottom: 14 }}>Complétez les 3 étapes ci-dessous pour lancer la partie.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: C.dim }}>① Code de la classe <span style={{ color: C.coral }}>*</span>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="STMG-A" style={inp} />
          <span style={{ fontSize: 10.5, color: C.dim }}>Le même pour toutes les équipes de la classe (pour le classement).</span>
        </label>
        <label style={{ fontSize: 12, color: C.dim }}>② Nom de l'équipe <span style={{ color: C.coral }}>*</span>
          <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Les Réformateurs" style={inp} />
          <span style={{ fontSize: 10.5, color: C.dim }}>Choisissez un nom qui vous représente.</span>
        </label>
      </div>

      <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>③ Choisissez votre doctrine <span style={{ color: C.coral }}>*</span> — une simple orientation : vous restez libre de tous vos choix ensuite.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        {DOCTRINES.map((d) => (
          <div key={d.id} onClick={() => setDoc(d.id)} style={{ cursor: "pointer", background: C.card, border: `2px solid ${doc === d.id ? d.color : C.line}`, borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Icon n={d.icon.replace("ti-", "")} size={20} color={d.color} />
              <span style={{ color: C.ink, fontWeight: 500, fontSize: 14 }}>{d.label}</span>
            </div>
            <div style={{ color: d.color, fontSize: 11, marginBottom: 4 }}>{d.ref}</div>
            <div style={{ color: C.sub, fontSize: 12, lineHeight: 1.5 }}>{d.desc}</div>
            <div style={{ color: d.color, fontSize: 11, lineHeight: 1.45, marginTop: 5, display: "flex", gap: 4 }}><Icon n="arrow-right" size={12} style={{ marginTop: 2, flexShrink: 0 }} /><span>{d.effet}</span></div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Btn kind="primary" disabled={!canStart} onClick={() => onStart(code.trim().toUpperCase(), team.trim(), doc)}>
          <Icon n="player-play" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Commencer le mandat
        </Btn>
        {hasSave && <Btn onClick={onResume}><Icon n="refresh" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Reprendre</Btn>}
        <Btn onClick={() => onLeaderboard(code.trim().toUpperCase())}><Icon n="trophy" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Classement</Btn>
      </div>
      {!canStart && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.gold, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon n="info-circle" size={14} />
          Avant de commencer, complétez : {[!code.trim() && "le code de classe", !team.trim() && "le nom d'équipe", !doc && "la doctrine"].filter(Boolean).join(", ")}.
        </div>
      )}
    </div>
  );
}
const inp = { display: "block", width: "100%", marginTop: 4, boxSizing: "border-box", background: "#12203A", border: "1px solid #2C4372", borderRadius: 8, color: "#F6F1E4", padding: "9px 11px", fontSize: 14 };

/* ---------- Écran Mission (objectif clair avant de jouer) ---------- */
function Mission({ team, doctrine, onGo }) {
  return (
    <div>
      <ScreenTitle icon="target-arrow" title="Votre mission" sub={`${team} · doctrine ${doctrine?.label}`} />
      <div style={{ background: C.card2, border: `1px solid ${C.line}`, borderRadius: 16, padding: 22, marginBottom: 18 }}>
        <p style={{ color: C.ink, fontSize: 16, lineHeight: 1.65, margin: 0 }}>
          Vous dirigez la France pendant <b>5 ans</b>. Chaque année : vous votez un <b>budget</b> (ce que l'État gagne et dépense), puis vous affrontez <b>3 événements</b> imprévus. À la fin, les Français votent.
        </p>
        <p style={{ color: C.sub, fontSize: 15, lineHeight: 1.65, margin: "12px 0 0" }}>
          Au départ, le pays va mal : un <b style={{ color: C.coral }}>déficit de 5 %</b> (l'État dépense plus qu'il ne gagne) et une <b style={{ color: C.coral }}>dette de 116 %</b> du PIB. Votre but : redresser les comptes <b>sans casser la société</b>. Attention, tout se tient — aucune décision n'est gratuite.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.gold, fontSize: 14, fontWeight: 500, marginBottom: 10 }}><Icon n="target" size={18} /> Vos objectifs</div>
          {OBJECTIFS.map((o) => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: C.sub, padding: "4px 0" }}>
              <Icon n={o.icon} size={15} color={C.dim} /> {o.label}
            </div>
          ))}
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.gold, fontSize: 14, fontWeight: 500, marginBottom: 10 }}><Icon n="trophy" size={18} /> Comment vous êtes noté·e</div>
          <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.8 }}>
            <div><b style={{ color: C.mint }}>Économie</b> 55 % · <b style={{ color: "#7FB0C9" }}>Social</b> 30 % · <b style={{ color: C.gold }}>Popularité</b> 15 %</div>
            <div style={{ color: C.dim, fontSize: 13, marginTop: 8 }}>Le <b>score</b> décide du classement entre équipes. Mais votre <b>réélection</b> dépend surtout de votre <b>popularité</b> le jour du vote !</div>
          </div>
        </div>
      </div>
      <Btn kind="primary" onClick={onGo} style={{ fontSize: 16, padding: "13px 22px" }}><Icon n="player-play" size={17} style={{ verticalAlign: -3, marginRight: 7 }} />Entrer en fonction</Btn>
    </div>
  );
}

/* ---------- Barre d'objectifs permanente ---------- */
function ObjBar({ ind }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
      {OBJECTIFS.map((o) => {
        const ok = o.ok(ind), near = !ok && o.near(ind);
        const col = ok ? C.mint : near ? C.gold : C.coral;
        return (
          <div key={o.id} title={o.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: col, background: col + "18", border: `1px solid ${col}44`, borderRadius: 20, padding: "3px 9px" }}>
            <Icon n={ok ? "circle-check" : near ? "circle-dot" : "circle-x"} size={13} /> {o.label}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Écran Budget (16 leviers, onglets Recettes/Dépenses) ---------- */
function BudgetScreen({ year, indPrev, baseLevels, levels, setLevels, doctrine, onValidate }) {
  const [tab, setTab] = useState("rec");
  const preview = useMemo(() => applyBudgetYear(indPrev, levels, baseLevels, year, doctrine), [indPrev, levels, baseLevels, year, doctrine]);
  const balance = preview.balanceMd;
  const setLevel = (id, v) => setLevels({ ...levels, [id]: clamp(v, LEVEL_MIN, LEVEL_MAX) });
  const list = LEVERS.filter((l) => l.cat === tab);
  // Projection : si on garde ce solde jusqu'en 2031, où finit la dette ?
  const detteProjetee = useMemo(() => {
    let d = indPrev.dette; const g = (preview.ind.croissance + 1.3) / 100;
    for (let i = year; i <= YEARS; i++) d = d + (-preview.ind.solde) - d * g;
    return d;
  }, [indPrev.dette, preview.ind.solde, preview.ind.croissance, year]);
  const detteMonte = detteProjetee > indPrev.dette + 1;
  const alerteDeficit = preview.ind.solde < -6;
  const alerteDette = detteProjetee > 140;
  return (
    <div>
      <ScreenTitle icon="wallet" title={`Budget ${2026 + year}`} sub={`Année ${year}/${YEARS} — ajustez par crans. Les taux se conservent d'une année sur l'autre.`} />
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[["rec", "Recettes", C.mint], ["dep", "Dépenses", C.coral]].map(([id, lab, col]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: "9px 0", borderRadius: 9, cursor: "pointer", fontSize: 13.5, fontWeight: 500, border: `1px solid ${tab === id ? col : C.line}`, background: tab === id ? col + "22" : "transparent", color: tab === id ? col : C.dim }}>
            {lab} <span style={{ opacity: .7, fontSize: 11 }}>({LEVERS.filter((l) => l.cat === id).length})</span>
          </button>
        ))}
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "2px 12px" }}>
        {list.map((l) => (
          <LeverRow key={l.id} lever={l} level={levels[l.id] || 0} baseLevel={baseLevels[l.id] || 0} onChange={(v) => setLevel(l.id, v)} />
        ))}
      </div>
      <div style={{ marginTop: 12, background: C.card2, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase" }}>Effet net sur le solde (cumulé)</div>
            <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 600, color: balance >= 0 ? C.mint : C.coral }}>{balance >= 0 ? "+" : ""}{fmt(balance)} Md€</div>
            {balance !== 0 && <div style={{ fontSize: 10.5, color: C.dim }}>soit {eqHab(balance)} et par an</div>}
          </div>
          <Btn kind="primary" onClick={onValidate}>Valider le budget <Icon n="arrow-right" size={15} style={{ verticalAlign: -2 }} /></Btn>
        </div>
        {/* Aperçu complet des conséquences prévues */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 10 }}>
          <PreviewChip label="Solde prévu" value={`${fmt(preview.ind.solde, 1)} %`} tone={preview.ind.solde < -6 ? "bad" : preview.ind.solde > -1 ? "good" : "mid"} />
          <PreviewChip label="Dette en 2031" value={`${fmt(detteProjetee, 0)} %`} tone={detteProjetee > 130 ? "bad" : detteProjetee < indPrev.dette ? "good" : "mid"} />
          <PreviewChip label="Croissance" value={`${preview.ind.croissance > 0 ? "+" : ""}${fmt(preview.ind.croissance, 1)} %`} delta={preview.ind.croissance - startYear(indPrev, year, doctrine).croissance} />
          <PreviewChip label="Chômage" value={`${fmt(preview.ind.chomage, 1)} %`} delta={-(preview.ind.chomage - indPrev.chomage)} />
        </div>
        <div style={{ fontSize: 11, color: C.dim, marginTop: 6, textAlign: "center" }}>
          Dette {fmt(indPrev.dette, 0)} % → <b style={{ color: detteMonte ? C.coral : C.mint }}>{fmt(detteProjetee, 0)} %</b> en fin de mandat si vous gardez ce cap.
        </div>
        {(alerteDeficit || alerteDette) && (
          <div style={{ marginTop: 10, background: "#3A1E1E", border: `1px solid ${C.coral}66`, borderRadius: 9, padding: "9px 12px", color: C.coral, fontSize: 12.5, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <Icon n="alert-triangle" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{alerteDeficit && `Déficit très élevé (${fmt(preview.ind.solde, 1)} %). `}{alerteDette && `À ce rythme, la dette grimpe à ${fmt(detteProjetee, 0)} % du PIB — risque de crise budgétaire. `}Pensez à augmenter des recettes ou réduire des dépenses.</span>
          </div>
        )}
        <div style={{ color: C.dim, fontSize: 11, marginTop: 8, textAlign: "center" }}>Prévision avant événements — les 3 cartes de l'année viendront tout bousculer.</div>
      </div>
    </div>
  );
}
function PreviewChip({ label, value, tone, delta }) {
  let col = C.gold;
  if (tone === "bad") col = C.coral; else if (tone === "good") col = C.mint;
  else if (delta != null) col = delta > 0.03 ? C.mint : delta < -0.03 ? C.coral : C.gold;
  return (
    <div style={{ background: "#12203A", border: `1px solid ${C.line}`, borderRadius: 9, padding: "7px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 600, color: col }}>{value}</div>
    </div>
  );
}

// Construit une phrase causale courte (« → chômage ↑, popularité ↓ ») selon le sens du réglage
function leverConseq(lever, d) {
  if (!d) return "";
  const s = Math.sign(d);
  const parts = [];
  const add = (val, up, down) => { if (!val) return; parts.push(val * s > 0 ? up : down); };
  if (lever.cro) add(lever.cro, "croissance ↑", "croissance ↓");
  if (lever.cho) add(lever.cho, "chômage ↑", "chômage ↓");
  if (lever.fx) {
    add(lever.fx.popularite, "popularité ↑", "popularité ↓");
    add(lever.fx.cohesion, "cohésion ↑", "cohésion ↓");
    add(lever.fx.environnement, "environnement ↑", "environnement ↓");
  }
  return parts.slice(0, 3).join(", ");
}
function LeverRow({ lever, level, baseLevel, onChange }) {
  const [info, setInfo] = useState(false);
  const rec = lever.cat === "rec";
  const curEur = levEur(lever, baseLevel), newEur = levEur(lever, level);
  const dEur = newEur - curEur;
  const curRate = levRate(lever, baseLevel), newRate = levRate(lever, level);
  const changed = level !== baseLevel;
  const soldeGood = rec ? dEur > 0 : dEur < 0;
  const chgCol = !changed ? C.dim : soldeGood ? C.mint : C.coral;
  const conseq = leverConseq(lever, level - baseLevel);
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon n={lever.icon} size={17} color={C.gold} />
        <span style={{ flex: 1, fontSize: 12.5, color: C.ink, lineHeight: 1.2 }}>{lever.label}</span>
        <button onClick={() => setInfo(!info)} title="Explication" style={{ background: "none", border: "none", cursor: "pointer", color: info ? C.gold : C.dim, padding: 0, display: "flex" }}><Icon n="help-circle" size={15} /></button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => onChange(level - 1)} style={stepBtn}>−</button>
          <span style={{ fontFamily: "monospace", fontSize: 14, width: 30, textAlign: "center", color: chgCol }}>{level > 0 ? "+" : ""}{level}</span>
          <button onClick={() => onChange(level + 1)} style={stepBtn}>+</button>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4, paddingLeft: 25, gap: 8 }}>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: C.sub }}>
          {curRate != null
            ? <>{fmt(curRate, 1)}{changed && <> → <b style={{ color: C.gold }}>{fmt(newRate, 1)}</b></>} {lever.unit}</>
            : <>{fmt(curEur)}{changed && <> → <b style={{ color: C.gold }}>{fmt(newEur)}</b></>} Md€</>}
          {curRate != null && <span style={{ color: C.dim }}> · {fmt(newEur)} Md€</span>}
        </span>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: chgCol, whiteSpace: "nowrap" }}>{changed ? `${dEur > 0 ? "+" : ""}${fmt(dEur, 1)} Md€/an` : "—"}</span>
      </div>
      {/* Effet causal visible dès qu'on modifie le levier */}
      {changed && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingLeft: 25, marginTop: 3, gap: 8 }}>
          <span style={{ fontSize: 10.5, color: chgCol }}>→ {conseq}</span>
          <span style={{ fontSize: 10, color: C.dim, whiteSpace: "nowrap" }}>{eqHab(dEur)}</span>
        </div>
      )}
      {!changed && <div style={{ fontSize: 10.5, color: C.dim, paddingLeft: 25, marginTop: 2 }}>{lever.hint}</div>}
      {info && <div style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.5, background: "#12203A", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", marginTop: 6, marginLeft: 25 }}><Icon n="bulb" size={12} color={C.gold} /> {lever.hint}</div>}
    </div>
  );
}
const stepBtn = { width: 24, height: 24, borderRadius: 6, border: "1px solid #2C4372", background: "#12203A", color: "#F6F1E4", fontSize: 16, cursor: "pointer", lineHeight: 1 };

/* ---------- Écran Événements ---------- */
function EventScreen({ event, index, total, onChoose }) {
  const t = TYPES[event.type];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: C.dim }}>Événement {index + 1} / {total}</span>
        <div style={{ display: "flex", gap: 4 }}>{Array.from({ length: total }).map((_, i) => <div key={i} style={{ width: 22, height: 4, borderRadius: 3, background: i <= index ? C.gold : C.line }} />)}</div>
      </div>
      <div style={{ background: C.card2, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: t.color + "26", color: t.color, fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 20, marginBottom: 10 }}>
          <Icon n={t.icon.replace("ti-", "")} size={14} /> {t.label}
        </div>
        <h3 style={{ margin: "0 0 6px", color: C.ink, fontSize: 18, fontFamily: "Fraunces,serif", fontWeight: 600 }}>{event.title}</h3>
        <p style={{ margin: "0 0 14px", color: C.sub, fontSize: 13.5, lineHeight: 1.6 }}>{event.desc}</p>
        <div style={{ display: "grid", gap: 9 }}>
          {event.choices.map((ch, i) => <ChoiceRow key={i} choice={ch} onClick={() => onChoose(ch)} />)}
        </div>
      </div>
    </div>
  );
}
function ChoiceRow({ choice, onClick }) {
  const fxChips = Object.entries(choice.fx).map(([k, v]) => {
    const m = IND_META.find((x) => x.id === k); if (!m) return null;
    return <span key={k} style={{ fontSize: 10.5, fontFamily: "monospace", color: v > 0 ? C.mint : C.coral, background: "#12203A", padding: "1px 6px", borderRadius: 5, border: `1px solid ${C.line}` }}>{m.label} {v > 0 ? "+" : ""}{fmt(v, 1)}</span>;
  }).filter(Boolean);
  return (
    <div style={{ background: "#12203A", border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 13px" }}>
      <div onClick={onClick} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <span style={{ color: C.ink, fontSize: 13.5, flex: 1 }}>{choice.label}</span>
        <Icon n="chevron-right" size={16} color={C.gold} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>{fxChips}</div>
      {(choice.fx.integrite || 0) <= -5 && (
        <div style={{ marginTop: 7, fontSize: 11, color: "#E0A96D", display: "flex", alignItems: "center", gap: 5 }}>
          <Icon n="alert-triangle" size={13} /> Entame fortement votre intégrité — risque de scandale plus tard.
        </div>
      )}
      {choice.note && <Note text={choice.note} />}
    </div>
  );
}
function ScreenTitle({ icon, title, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon n={icon} size={22} color={C.gold} />
        <h2 style={{ margin: 0, color: C.ink, fontSize: 20, fontFamily: "Fraunces,serif", fontWeight: 600 }}>{title}</h2>
      </div>
      {sub && <p style={{ margin: "2px 0 0 30px", color: C.dim, fontSize: 13 }}>{sub}</p>}
    </div>
  );
}

/* ============================================================
   FLUX (PIB, recettes, dépenses en Md€) — calculés à la clôture
   pour alimenter les graphiques. Le jeu raisonne en % du PIB ;
   on reconstruit ici des montants cohérents avec le solde affiché.
   ============================================================ */
const RECETTES0 = 1450, DEPENSES0 = 1600;
function computeFlows(ind, levels, pibPrev) {
  const pib = pibPrev * (1 + (ind.croissance + 1.3) / 100);
  let revBalance = 0;
  for (const lev of LEVERS) if (lev.cat === "rec") revBalance += (levels[lev.id] || 0) * lev.eurStep;
  const recettes = RECETTES0 * (pib / PIB) + revBalance;
  const soldeMd = ind.solde * pib / 100;          // cohérent avec le solde affiché
  const depenses = recettes - soldeMd;
  return { pib, recettes, depenses };
}

/* ============================================================
   GRAPHIQUES SVG MAISON (sans dépendance)
   ============================================================ */
function ChartFrame({ title, legend, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ color: C.ink, fontSize: 12.5, fontWeight: 500 }}>{title}</span>
        {legend && <span style={{ display: "flex", gap: 8 }}>{legend.map((l) => (
          <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: C.dim }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />{l.label}
          </span>
        ))}</span>}
      </div>
      {children}
    </div>
  );
}
function niceBounds(lo, hi) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.14;
  return [lo - pad, hi + pad];
}
function LineChartSVG({ data, color, refValue, refLabel, decimals = 0 }) {
  const W = 300, H = 136, L = 34, R = 10, T = 12, B = 20;
  if (!data.length) return null;
  const ys = data.map((d) => d.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (refValue != null) { lo = Math.min(lo, refValue); hi = Math.max(hi, refValue); }
  [lo, hi] = niceBounds(lo, hi);
  const x = (i) => L + (data.length <= 1 ? (W - L - R) / 2 : (i / (data.length - 1)) * (W - L - R));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.y).toFixed(1)}`).join(" ");
  const area = data.length > 1 ? `${line} L${x(data.length - 1).toFixed(1)},${y(lo).toFixed(1)} L${x(0).toFixed(1)},${y(lo).toFixed(1)} Z` : "";
  const gid = "grad" + Math.random().toString(36).slice(2, 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor={color} stopOpacity="0.25" /><stop offset="1" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      {[0, 0.5, 1].map((t, i) => { const vy = T + t * (H - T - B); const val = hi - t * (hi - lo); return (
        <g key={i}><line x1={L} x2={W - R} y1={vy} y2={vy} stroke={C.line} strokeWidth="0.5" />
          <text x={L - 4} y={vy + 3} textAnchor="end" fill={C.dim} style={{ font: "8px monospace" }}>{fmt(val, decimals)}</text></g>); })}
      {refValue != null && <g>
        <line x1={L} x2={W - R} y1={y(refValue)} y2={y(refValue)} stroke={C.gold} strokeDasharray="3 3" strokeWidth="0.8" opacity="0.7" />
        {refLabel && <text x={W - R} y={y(refValue) - 3} textAnchor="end" fill={C.gold} style={{ font: "8px monospace" }} opacity="0.85">{refLabel}</text>}
      </g>}
      {area && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.y)} r="2.4" fill={color} />)}
      {data.map((d, i) => <text key={i} x={x(i)} y={H - 5} textAnchor="middle" fill={C.dim} style={{ font: "8px monospace" }}>{d.x}</text>)}
    </svg>
  );
}
function GroupedBarsSVG({ data, colorA, colorB }) {
  const W = 300, H = 136, L = 34, R = 10, T = 12, B = 20;
  if (!data.length) return null;
  const vals = data.flatMap((d) => [d.a, d.b]);
  let lo = Math.min(...vals) * 0.96, hi = Math.max(...vals) * 1.03;
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const n = data.length, gw = (W - L - R) / n, bw = Math.min(13, gw * 0.3);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[0, 0.5, 1].map((t, i) => { const vy = T + t * (H - T - B); const val = hi - t * (hi - lo); return (
        <g key={i}><line x1={L} x2={W - R} y1={vy} y2={vy} stroke={C.line} strokeWidth="0.5" />
          <text x={L - 4} y={vy + 3} textAnchor="end" fill={C.dim} style={{ font: "8px monospace" }}>{fmt(val, 0)}</text></g>); })}
      {data.map((d, i) => { const cx = L + gw * i + gw / 2; return (
        <g key={i}>
          <rect x={cx - bw - 1} y={y(d.a)} width={bw} height={Math.max(0, y(lo) - y(d.a))} fill={colorA} rx="1.5" />
          <rect x={cx + 1} y={y(d.b)} width={bw} height={Math.max(0, y(lo) - y(d.b))} fill={colorB} rx="1.5" />
          <text x={cx} y={H - 5} textAnchor="middle" fill={C.dim} style={{ font: "8px monospace" }}>{d.x}</text>
        </g>); })}
    </svg>
  );
}
function EvolutionCharts({ history }) {
  if (!history || history.length === 0)
    return <div style={{ color: C.dim, fontSize: 12.5, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 }}>Les graphiques d'évolution apparaîtront à la fin de la première année.</div>;
  let pib = PIB;
  const rows = history.map((h) => {
    pib = pib * (1 + (h.ind.croissance + 1.3) / 100);
    const P = h.pib ?? pib;
    const rec = h.recettes ?? (RECETTES0 * (P / PIB));
    const dep = h.depenses ?? (rec - h.ind.solde * P / 100);
    return { x: "'" + String(2026 + h.year).slice(2), dette: h.ind.dette, chomage: h.ind.chomage, pib: P, rec, dep };
  });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <ChartFrame title="Dette (% du PIB)">
        <LineChartSVG data={rows.map((r) => ({ x: r.x, y: +r.dette.toFixed(1) }))} color={C.coral} refValue={116} refLabel="départ 116" decimals={0} />
      </ChartFrame>
      <ChartFrame title="PIB (Md€)">
        <LineChartSVG data={rows.map((r) => ({ x: r.x, y: Math.round(r.pib) }))} color={C.mint} decimals={0} />
        <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.4, marginTop: 4 }}>PIB nominal (en euros courants) : il progresse avec la croissance <em>et</em> l'inflation (~1,3 %/an supposée).</div>
      </ChartFrame>
      <ChartFrame title="Recettes vs Dépenses (Md€)" legend={[{ label: "Recettes", color: C.mint }, { label: "Dépenses", color: C.coral }]}>
        <GroupedBarsSVG data={rows.map((r) => ({ x: r.x, a: r.rec, b: r.dep }))} colorA={C.mint} colorB={C.coral} />
      </ChartFrame>
      <ChartFrame title="Chômage (%)">
        <LineChartSVG data={rows.map((r) => ({ x: r.x, y: +r.chomage.toFixed(1) }))} color={C.gold} refValue={7.5} refLabel="départ 7,5" decimals={1} />
      </ChartFrame>
    </div>
  );
}

/* ---------- Bilan d'année + Conseiller ---------- */
function YearSummary({ year, indBefore, ind, flags, onNext, onTable, history }) {
  const bilan = useMemo(() => conseiller(indBefore, ind, flags), [indBefore, ind, flags]);
  const wins = useMemo(() => victoires(indBefore, ind), [indBefore, ind]);
  return (
    <div>
      <ScreenTitle icon="clipboard-check" title={`Bilan ${2026 + year}`} sub="Voici l'état du pays après vos décisions" />
      <HUD ind={ind} prev={indBefore} />

      {/* Victoires intermédiaires (renforcement positif) */}
      {wins.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
          {wins.map((w, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: C.mint + "1A", border: `1px solid ${C.mint}55`, borderRadius: 9, padding: "8px 12px", color: C.mint, fontSize: 12.5, fontWeight: 500 }}>
              <Icon n={w.icon} size={16} /> {w.label}
            </div>
          ))}
        </div>
      )}

      {/* Le conseiller */}
      <div style={{ marginTop: 14, background: C.card2, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="user-check" size={18} color="#12203A" /></div>
          <div><div style={{ color: C.ink, fontSize: 13.5, fontWeight: 500 }}>Le mot de votre conseiller</div><div style={{ color: C.dim, fontSize: 11 }}>Bilan de l'année {2026 + year}</div></div>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <BilanLine icon="chart-line" color={C.mint} label="Économie" text={bilan.eco} />
          <BilanLine icon="users-group" color="#7FB0C9" label="Société" text={bilan.social} />
          {bilan.alerte.map((a, i) => <BilanLine key={i} icon="alert-triangle" color={C.coral} label="Alerte" text={a} />)}
        </div>
      </div>

      {/* Graphiques d'évolution */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.ink, fontSize: 13.5, fontWeight: 500, marginBottom: 8 }}><Icon n="chart-dots" size={16} color={C.gold} /> Évolution depuis le début du mandat</div>
        <EvolutionCharts history={history} />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <Btn onClick={onTable}><Icon n="table" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Tableau de bord</Btn>
        <Btn kind="primary" onClick={onNext}>{year >= YEARS ? "Élection présidentielle" : `Passer à ${2027 + year}`} <Icon n="arrow-right" size={15} style={{ verticalAlign: -2 }} /></Btn>
      </div>
    </div>
  );
}
function BilanLine({ icon, color, label, text }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 82, color, fontSize: 11.5, fontWeight: 500, paddingTop: 1 }}><Icon n={icon} size={14} /> {label}</div>
      <div style={{ flex: 1, color: C.sub, fontSize: 13, lineHeight: 1.55 }}>{text}</div>
    </div>
  );
}

/* ---------- Tableau récapitulatif (années VALIDÉES uniquement) ---------- */
function ResultsTable({ history, onClose }) {
  return (
    <div>
      <ScreenTitle icon="table" title="Tableau de bord du mandat" sub="L'évolution année par année (années terminées)" />
      {history.length === 0
        ? <div style={{ color: C.dim, fontSize: 13, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 }}>Aucune année terminée pour l'instant. Le tableau se remplira à la fin de chaque année.</div>
        : (
          <>
          <div style={{ marginBottom: 14 }}><EvolutionCharts history={history} /></div>
          <div style={{ overflowX: "auto", background: C.card, border: `1px solid ${C.line}`, borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "monospace" }}>
              <thead><tr style={{ color: C.dim }}>
                <th style={thc}>Année</th>
                {IND_META.map((m) => <th key={m.id} style={{ ...thc, textAlign: "right" }}>{m.label}</th>)}
              </tr></thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.year} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={{ ...tdc, color: C.ink }}>{2026 + r.year}</td>
                    {IND_META.map((m) => <td key={m.id} style={{ ...tdc, textAlign: "right", color: indColor(m, r.ind[m.id]) }}>{m.fmt(r.ind[m.id])}{m.unit}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      <div style={{ marginTop: 14 }}><Btn kind="primary" onClick={onClose}><Icon n="arrow-left" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Revenir au jeu</Btn></div>
    </div>
  );
}
const thc = { padding: "9px 10px", textAlign: "left", fontWeight: 500, whiteSpace: "nowrap" };
const tdc = { padding: "7px 10px", whiteSpace: "nowrap" };

/* ---------- Élection finale ---------- */
function Election({ onReveal }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => { const t = setTimeout(() => setPhase(1), 1400); return () => clearTimeout(t); }, []);
  return (
    <div style={{ textAlign: "center", padding: "30px 10px" }}>
      <Icon n="ballpen" size={44} color={C.gold} />
      <h2 style={{ color: C.ink, fontFamily: "Fraunces,serif", fontSize: 26, margin: "12px 0 6px" }}>Le jour du vote</h2>
      <p style={{ color: C.dim, fontSize: 14 }}>Après 5 ans, les Français jugent votre bilan…</p>
      {phase === 0
        ? <div style={{ color: C.gold, marginTop: 20, fontSize: 14 }}><Icon n="loader" size={18} /> Dépouillement en cours…</div>
        : <div style={{ marginTop: 20 }}><Btn kind="primary" onClick={onReveal}>Découvrir le verdict <Icon n="arrow-right" size={15} style={{ verticalAlign: -2 }} /></Btn></div>}
    </div>
  );
}

/* ---------- Débriefing ---------- */
function Debrief({ game, sc, end, leaderboard, onReplay, onHome }) {
  const podium = [...(leaderboard || [])].sort((a, b) => b.score - a.score);
  return (
    <div>
      <div style={{ textAlign: "center", background: end.color + "1A", border: `1px solid ${end.color}66`, borderRadius: 16, padding: 22, marginBottom: 16 }}>
        <Icon n={end.icon} size={46} color={end.color} />
        <h2 style={{ color: end.color, fontFamily: "Fraunces,serif", fontSize: 26, margin: "10px 0 6px" }}>{end.title}</h2>
        <p style={{ color: C.sub, fontSize: 13.5, lineHeight: 1.6, maxWidth: 520, margin: "0 auto" }}>{end.text}</p>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${end.color}33`, maxWidth: 560, margin: "12px auto 0" }}>
          <div style={{ fontSize: 10.5, color: C.dim, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 3 }}>Ce qui explique ce résultat</div>
          <div style={{ color: C.ink, fontSize: 13, lineHeight: 1.55 }}>{expliquerFin(game)}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        {[["Économie", sc.eco, "55 %"], ["Social", sc.social, "30 %"], ["Politique", sc.politique, "15 %"], ["SCORE", sc.total, "final"]].map(([l, v, w], i) => (
          <div key={l} style={{ background: i === 3 ? C.gold : C.card, borderRadius: 12, padding: "12px 10px", textAlign: "center", border: `1px solid ${i === 3 ? C.gold : C.line}` }}>
            <div style={{ fontSize: 10.5, color: i === 3 ? "#12203A" : C.dim, textTransform: "uppercase", letterSpacing: ".04em" }}>{l} <span style={{ opacity: .7 }}>{w}</span></div>
            <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 600, color: i === 3 ? "#12203A" : indScoreCol(v) }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ color: C.dim, fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Leçon du mandat</div>
        <div style={{ color: C.ink, fontSize: 14 }}>{lessonFor(game.ind)}</div>
      </div>
      <DecisionsRecap decisions={game.decisions} />
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.ink, fontSize: 15, fontWeight: 500, marginBottom: 8 }}><Icon n="trophy" size={18} color={C.gold} /> Classement — {game.code}</div>
        {podium.length === 0 && <div style={{ color: C.dim, fontSize: 13 }}>Aucun score enregistré pour l'instant.</div>}
        <div style={{ display: "grid", gap: 6 }}>
          {podium.slice(0, 8).map((e, i) => {
            const me = e.team === game.team && e.score === sc.total;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: me ? C.gold + "22" : C.card, border: `1px solid ${me ? C.gold : C.line}`, borderRadius: 9, padding: "8px 12px" }}>
                <span style={{ width: 22, textAlign: "center", fontFamily: "monospace", color: i < 3 ? C.gold : C.dim, fontSize: 15 }}>{i + 1}</span>
                <span style={{ flex: 1, color: C.ink, fontSize: 13.5 }}>{e.team}</span>
                <span style={{ fontSize: 11, color: C.dim }}>{e.ending}</span>
                <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 600, color: C.gold }}>{e.score}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn kind="primary" onClick={onReplay}><Icon n="refresh" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Rejouer</Btn>
        <Btn onClick={onHome}><Icon n="home" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Accueil</Btn>
      </div>
    </div>
  );
}
function DecisionsRecap({ decisions }) {
  const [open, setOpen] = useState(false);
  if (!decisions || !decisions.length) return null;
  const byYear = {};
  for (const d of decisions) { (byYear[d.year] = byYear[d.year] || []).push(d); }
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <button onClick={() => setOpen(!open)} style={{ background: "none", border: "none", cursor: "pointer", color: C.ink, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, padding: 0, width: "100%" }}>
        <Icon n="list-check" size={16} color={C.gold} /> Vos {decisions.length} décisions face aux événements
        <span style={{ marginLeft: "auto", color: C.dim }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {Object.keys(byYear).sort((a, b) => a - b).map((y) => (
            <div key={y}>
              <div style={{ fontSize: 11, color: C.gold, fontWeight: 500, marginBottom: 4 }}>{2026 + Number(y)}</div>
              <div style={{ display: "grid", gap: 4 }}>
                {byYear[y].map((d, i) => {
                  const t = TYPES[d.type] || {};
                  return (
                    <div key={i} style={{ fontSize: 12.5, color: C.sub, display: "flex", gap: 7, alignItems: "flex-start" }}>
                      <Icon n={(t.icon || "point").replace("ti-", "")} size={13} color={t.color || C.dim} style={{ marginTop: 2, flexShrink: 0 }} />
                      <span><span style={{ color: C.ink }}>{d.event}</span> → {d.choice}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
const indScoreCol = (v) => (v >= 65 ? C.mint : v >= 45 ? C.gold : C.coral);

/* ---------- Classement autonome ---------- */
function LeaderboardView({ code, entries, onBack }) {
  const podium = [...(entries || [])].sort((a, b) => b.score - a.score);
  return (
    <div>
      <ScreenTitle icon="trophy" title={`Classement — ${code}`} sub={`${podium.length} partie(s) enregistrée(s)`} />
      {podium.length === 0 && <div style={{ color: C.dim, fontSize: 13, marginBottom: 12 }}>Aucune partie enregistrée sous ce code.</div>}
      <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
        {podium.map((e, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: C.card, border: `1px solid ${i < 3 ? C.gold : C.line}`, borderRadius: 9, padding: "8px 12px" }}>
            <span style={{ width: 22, textAlign: "center", fontFamily: "monospace", color: i < 3 ? C.gold : C.dim, fontSize: 15 }}>{i + 1}</span>
            <span style={{ flex: 1, color: C.ink, fontSize: 13.5 }}>{e.team}</span>
            <span style={{ fontSize: 11, color: C.dim }}>{e.ending}</span>
            <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 600, color: C.gold }}>{e.score}</span>
          </div>
        ))}
      </div>
      <Btn kind="primary" onClick={onBack}><Icon n="arrow-left" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Retour</Btn>
    </div>
  );
}

/* ============================================================
   APP — machine à états
   ============================================================ */
export default function App() {
  const [screen, setScreen] = useState("home");
  const [game, setGame] = useState(null);
  const [workLevels, setWorkLevels] = useState({});   // niveaux édités cette année
  const [evts, setEvts] = useState([]);
  const [evtIdx, setEvtIdx] = useState(0);
  const [indBefore, setIndBefore] = useState(null);   // état au début de l'année (pour bilan)
  const [flags, setFlags] = useState([]);
  const [end, setEnd] = useState(null);
  const [sc, setSc] = useState(null);
  const [board, setBoard] = useState([]);
  const [hasSave, setHasSave] = useState(false);
  const [boardCode, setBoardCode] = useState("STMG");

  const doctrineOf = (g) => DOCTRINES.find((d) => d.id === g.doctrineId);

  useEffect(() => { (async () => { const s = await storage.get(saveKey("STMG", "__any__")); if (s) setHasSave(true); })(); }, []);

  const persist = useCallback(async (g) => {
    await storage.set(saveKey(g.code, g.team), g);
    await storage.set(saveKey("STMG", "__any__"), { code: g.code, team: g.team });
    setHasSave(true);
  }, []);

  function start(code, team, doctrineId) {
    const g = { code, team, doctrineId, year: 1, ind: { ...START }, levels: {}, history: [], usedIds: [], pendingFlags: [] };
    setGame(g); setWorkLevels({}); setScreen("mission"); persist(g);
  }
  async function resume() {
    const ptr = await storage.get(saveKey("STMG", "__any__")); if (!ptr) return;
    const g = await storage.get(saveKey(ptr.code, ptr.team));
    if (g) { setGame(g); setWorkLevels({ ...(g.levels || {}) }); setScreen("budget"); }
  }

  function validateBudget() {
    const doc = doctrineOf(game);
    const res = applyBudgetYear(game.ind, workLevels, game.levels, game.year, doc);
    setIndBefore(game.ind);                         // état avant l'année (pour le conseiller)
    const drawn = drawEvents(game.year, game.usedIds, game.pendingFlags);
    setEvts(drawn); setEvtIdx(0);
    setGame({ ...game, ind: res.ind, levels: { ...workLevels } });
    setScreen("events");
  }

  function chooseEvent(choice) {
    const ev = evts[evtIdx];
    const newInd = applyFx(game.ind, choice.fx);
    const usedIds = [...game.usedIds, ev.id];
    const decisions = [...(game.decisions || []), { year: game.year, event: ev.title, type: ev.type, choice: choice.label }];
    if (evtIdx + 1 < evts.length) { setGame({ ...game, ind: newInd, usedIds, decisions }); setEvtIdx(evtIdx + 1); }
    else {
      const { ind: finalInd, flags: fl } = finalizeYear(newInd);
      const pibPrev = game.history.length ? game.history[game.history.length - 1].pib : PIB;
      const flows = computeFlows(finalInd, game.levels, pibPrev);
      const history = [...game.history, { year: game.year, ind: finalInd, ...flows }];
      const g2 = { ...game, ind: finalInd, usedIds, decisions, history, pendingFlags: fl };
      setFlags(fl); setGame(g2); persist(g2); setScreen("summary");
    }
  }

  function nextYear() {
    if (game.year >= YEARS) { setScreen("election"); return; }
    const g2 = { ...game, year: game.year + 1 };
    setGame(g2); setWorkLevels({ ...(g2.levels || {}) }); persist(g2); setScreen("budget");
  }

  async function reveal() {
    const score = scoreBreakdown(game.ind);
    const e = ending(game.ind, score);
    setSc(score); setEnd(e);
    const entry = { team: game.team, score: score.total, eco: score.eco, social: score.social, politique: score.politique, ending: e.title, date: Date.now() };
    const existing = (await storage.get(lbKey(game.code), true)) || [];
    const updated = [...existing.filter((x) => x.team !== game.team), entry];
    await storage.set(lbKey(game.code), updated, true);
    await storage.del(saveKey(game.code, game.team)); await storage.del(saveKey("STMG", "__any__"));
    setHasSave(false); setBoard(updated); setScreen("debrief");
  }
  async function openLeaderboard(code) { setBoardCode(code); const e = (await storage.get(lbKey(code), true)) || []; setBoard(e); setScreen("leaderboard"); }

  const progress = game ? ((game.year - 1) / YEARS) * 100 : 0;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "Inter,system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap');
        @import url('https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/3.11.0/tabler-icons.min.css');
        * { box-sizing: border-box; } button:hover { filter: brightness(1.08); }
        ::-webkit-scrollbar { height: 8px; width: 8px; } ::-webkit-scrollbar-thumb { background: #2C4372; border-radius: 4px; }`}</style>
      <div style={{ maxWidth: (screen === "home" || screen === "mission") ? 1040 : 760, margin: "0 auto", padding: (screen === "home" || screen === "mission") ? "40px 24px 48px" : "18px 16px 40px" }}>
        {game && screen !== "home" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="building-bank" size={17} color="#12203A" /></div>
                <div><div style={{ color: C.ink, fontSize: 14, fontWeight: 500, lineHeight: 1 }}>{game.team}</div><div style={{ color: C.dim, fontSize: 11 }}>{doctrineOf(game)?.label} · {game.code}</div></div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: C.dim, fontSize: 10, textTransform: "uppercase" }}>Mandat</div>
                <div style={{ color: C.gold, fontFamily: "monospace", fontSize: 16, fontWeight: 600, lineHeight: 1 }}>Année {Math.min(game.year, YEARS)}<span style={{ color: C.line, fontSize: 12 }}>/{YEARS}</span></div>
              </div>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: "#1E3157", overflow: "hidden" }}><div style={{ width: `${progress}%`, height: "100%", background: C.gold, transition: "width .4s" }} /></div>
            {["budget", "events"].includes(screen) && <div style={{ marginTop: 10 }}><HUD ind={game.ind} /><ObjBar ind={game.ind} /></div>}
          </div>
        )}

        {screen === "home" && <Home hasSave={hasSave} onStart={start} onResume={resume} onLeaderboard={openLeaderboard} />}
        {screen === "mission" && game && <Mission team={game.team} doctrine={doctrineOf(game)} onGo={() => setScreen("budget")} />}
        {screen === "budget" && game && <BudgetScreen year={game.year} indPrev={game.ind} baseLevels={game.levels} levels={workLevels} setLevels={setWorkLevels} doctrine={doctrineOf(game)} onValidate={validateBudget} />}
        {screen === "events" && game && evts[evtIdx] && <EventScreen event={evts[evtIdx]} index={evtIdx} total={evts.length} onChoose={chooseEvent} />}
        {screen === "summary" && game && <YearSummary year={game.year} indBefore={indBefore} ind={game.ind} flags={flags} onNext={nextYear} onTable={() => setScreen("table")} history={game.history} />}
        {screen === "table" && game && <ResultsTable history={game.history} onClose={() => setScreen("summary")} />}
        {screen === "election" && game && <Election onReveal={reveal} />}
        {screen === "debrief" && game && sc && end && <Debrief game={game} sc={sc} end={end} leaderboard={board} onReplay={() => start(game.code, game.team, game.doctrineId)} onHome={() => { setGame(null); setScreen("home"); }} />}
        {screen === "leaderboard" && <LeaderboardView code={boardCode} entries={board} onBack={() => setScreen("home")} />}
      </div>
    </div>
  );
}
