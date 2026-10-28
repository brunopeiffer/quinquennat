import React, { useState, useEffect, useMemo, useCallback } from "react";

/* ============================================================
   QUINQUENNAT — À VOUS DE GOUVERNER
   Jeu de gestion budgétaire pour Terminale STMG.
   France, 5 ans. Taux/budgets persistants, chiffres réalistes.
   ============================================================ */

let START = {
  solde: -5.0, dette: 116, chomage: 7.5, croissance: 1.0, inflation: 1.3,
  popularite: 52, cohesion: 55, integrite: 70, environnement: 50, inegalites: 45,
};
const PIB = 3000;           // Md€ (1 % PIB ≈ 30 Md€)
let YEARS = 5;
let POP_FR = 68;          // millions d'habitants
// --- Amplification "jeu" : les décisions ont un impact plus fort que dans la réalité,
// pour qu'un bon mandat puisse viser 0 % de déficit, voire un excédent, en 5 ans. ---
const SOLDE_DIV = 14;       // Md€ pour bouger le solde de 1 point de PIB (réel ≈ 30)
const IMPACT = 1.4;         // amplifie l'effet des leviers sur les jauges (popularité, cohésion…)
const IMPULSE_GAIN = 1.5;   // amplifie l'effet des décisions sur la croissance
const LEVEL_MIN = -8, LEVEL_MAX = 10;   // bornes cumulées d'un levier
// --- Coût de la dette : taux d'emprunt dynamique (réaction des marchés) ---
let PRIMARY_BASE = -3.0;  // solde PRIMAIRE de départ (hors intérêts) ; + charge ≈ -5 % total
// Deux taux distincts (réalité oct. 2026 : OAT 10 ans ≈ 4,7-4,9 %, mais dette ancienne empruntée moins cher) :
let TAUX0 = 1.8;          // taux MOYEN de la dette (stock) au départ : c'est lui qui fixe la charge d'intérêts
let MARCHE0 = 4.7;        // taux de MARCHÉ (nouveaux emprunts, OAT 10 ans) au départ
let TAUX_BASE = 3.7;
const TAUX_KDETTE = 0.03, TAUX_KDEF = 0.5, TAUX_KCONF = 0.35; // réaction des marchés (forte)
const TAUX_ADJ = 0.5;
let TAUX_MIN = 2.5, TAUX_MAX = 9.0;  // vitesse d'ajustement et bornes du taux de marché
const REFI_BASE = 0.07, REFI_DEF = 0.5;                // part de la dette refinancée chaque année au taux de marché
// Bornes de croissance annuelle : même en poussant tous les curseurs, pas de miracle (4 %),
// et une récession plafonnée à -3,5 % (plus réaliste que ±6 %).
const GROWTH_MIN = -3.5, GROWTH_MAX = 4.0;

/* ============================================================
   ÉPOQUES — « Auriez-vous fait mieux ? »
   Sources : dette et déficit (INSEE, comptes nationaux, via « Histoire de la dette publique
   française ») ; chômage BIT (INSEE, séries longues) ; inflation (INSEE / Banque mondiale).
   À VÉRIFIER (étape 2) : croissance, taux à 10 ans, taux moyen de la dette, population,
   taux d'impôt d'époque, et chômage 1974 (la série BIT INSEE débute en 1975 à 3,6 %).
   pib = PIB de l'année en milliards d'euros courants (montants affichés convertis en euros).
   ============================================================ */
const ERAS = [
  { id: "giscard", president: "V. Giscard d'Estaing", debut: 1974, duree: 7, tagline: "Le choc pétrolier frappe", pib: 175, pop: 52.6,
    dette: 14.5, solde: -0.3, chomage: 3.0, inflation: 13.7, inflTrend: 10.5, croissance: 4.5, potentiel: 3.0, marche: 10.4, moyen: 7.0, marcheFin: 13.0, inflFin: 13.4,
    rates: { tva: 17.6, ir: 60, is: 50 }, disabled: ["csg", "patrimoine"], couleurs: ["#8a6a3e", "#2a1e12"] },
  { id: "mitterrand1", president: "F. Mitterrand", debut: 1981, duree: 7, tagline: "Inflation à 13 %, taux à 15 %", pib: 511, pop: 54.0,
    dette: 22.0, solde: -2.4, chomage: 6.6, inflation: 13.4, inflTrend: 7.0, croissance: 1.2, potentiel: 2.2, marche: 15.8, moyen: 7.5, marcheFin: 9.0, inflFin: 2.7,
    rates: { tva: 17.6, ir: 60, is: 50 }, disabled: ["csg"], couleurs: ["#7a5a3a", "#24180f"] },
  { id: "mitterrand2", president: "F. Mitterrand", debut: 1988, duree: 7, tagline: "Croissance retrouvée, puis récession", pib: 926, pop: 55.9,
    dette: 33.6, solde: -2.6, chomage: 8.9, inflation: 2.7, inflTrend: 2.5, croissance: 4.6, potentiel: 2.5, marche: 9.0, moyen: 8.0, marcheFin: 7.5, inflFin: 1.8,
    rates: { tva: 18.6, ir: 56.8, is: 42 }, disabled: ["csg"], couleurs: ["#6a5a7a", "#1f1a28"] },
  { id: "chirac1", president: "J. Chirac", debut: 1995, duree: 7, tagline: "Objectif : qualifier la France pour l'euro", pib: 1218, pop: 57.8,
    dette: 56.1, solde: -5.1, chomage: 10.0, inflation: 1.8, inflTrend: 1.4, croissance: 2.1, potentiel: 2.2, marche: 7.5, moyen: 7.0, marcheFin: 5.0, inflFin: 1.9,
    rates: { tva: 18.6, ir: 56.8, is: 33.3, csg: 2.4 }, disabled: [], couleurs: ["#4f6a6a", "#182424"] },
  { id: "chirac2", president: "J. Chirac", debut: 2002, duree: 5, tagline: "L'euro entre dans les poches", pib: 1587, pop: 59.9,
    dette: 60.3, solde: -3.2, chomage: 7.9, inflation: 1.9, inflTrend: 1.9, croissance: 1.1, potentiel: 2.0, marche: 4.9, moyen: 5.5, marcheFin: 4.3, inflFin: 1.5,
    rates: { tva: 19.6, ir: 49.6, is: 33.3, csg: 7.5 }, disabled: [], couleurs: ["#4a5f78", "#161d26"] },
  { id: "sarkozy", president: "N. Sarkozy", debut: 2007, duree: 5, tagline: "La crise financière arrive", pib: 1942, pop: 63.6,
    dette: 64.5, solde: -2.6, chomage: 8.0, inflation: 1.5, inflTrend: 1.7, croissance: 2.4, potentiel: 1.8, marche: 4.3, moyen: 4.3, marcheFin: 3.0, inflFin: 2.0,
    rates: { tva: 19.6, ir: 40, is: 33.3, csg: 7.5 }, disabled: [], couleurs: ["#3d5a4f", "#101816"] },
  { id: "hollande", president: "F. Hollande", debut: 2012, duree: 5, tagline: "La zone euro dans la tourmente", pib: 2089, pop: 65.2,
    dette: 90.6, solde: -5.0, chomage: 9.8, inflation: 2.0, inflTrend: 0.8, croissance: 0.3, potentiel: 1.2, marche: 2.5, moyen: 3.0, marcheFin: 0.8, inflFin: 1.0,
    rates: { tva: 19.6, ir: 41, is: 33.3, csg: 7.5 }, disabled: [], couleurs: ["#5a6b80", "#161c24"] },
  { id: "macron1", president: "E. Macron", debut: 2017, duree: 5, tagline: "Gilets jaunes, puis pandémie", pib: 2295, pop: 66.8,
    dette: 98.4, solde: -2.8, chomage: 9.4, inflation: 1.0, inflTrend: 1.4, croissance: 2.2, potentiel: 1.3, marche: 0.8, moyen: 2.0, marcheFin: 1.0, inflFin: 1.6,
    rates: { tva: 20, ir: 45, is: 33.3, csg: 7.5 }, disabled: [], couleurs: ["#4a5a7a", "#141a2a"] },
  { id: "macron2", president: "E. Macron", debut: 2022, duree: 5, tagline: "Inflation et remontée des taux", pib: 2640, pop: 67.9,
    dette: 111.0, solde: -4.8, chomage: 7.3, inflation: 5.2, inflTrend: 2.5, croissance: 2.6, potentiel: 1.0, marche: 1.7, moyen: 1.4, marcheFin: 3.3, inflFin: 1.0, inflLink: 0,
    rates: { tva: 20, ir: 45, is: 25, csg: 9.2 }, disabled: [], couleurs: ["#3a4a72", "#10162a"] },
  { id: "today", president: "Vous", debut: 2027, duree: 5, tagline: "Dette record, taux à 4,7 %", pib: 3000, pop: 68.5,
    dette: 116, solde: -5.0, chomage: 7.5, inflation: 1.3, inflTrend: 1.3, croissance: 1.0, potentiel: 1.0, marche: 4.7, moyen: 1.8,
    rates: {}, disabled: [], couleurs: ["#1c2b55", "#070b18"] },
];
const START_TODAY = { ...START };
// Contexte d'époque (modifié par applyEra au lancement d'une partie)
let CURRENT_ERA = ERAS[ERAS.length - 1];
let BASE_YEAR = 2026, ECH = 1, DETTE0 = 116, CHOM0 = 7.5, INFL0 = 1.3, INFL_TREND = 1.3, GROWTH_POT = 1.0;
let ERA_RATES = {}, DISABLED = [], INFL_LINK = 0.7, MARCHE_DRIFT = 0, CUR_Y = 1;
const eraById = (id) => ERAS.find((e) => e.id === id) || ERAS[ERAS.length - 1];
const eraLabel = (e) => e.id === "today" ? `Aujourd'hui · ${e.debut}-${e.debut + e.duree}` : `Mandat de ${e.president} · ${e.debut}-${e.debut + e.duree}`;
function applyEra(id) {
  const e = eraById(id);
  CURRENT_ERA = e; YEARS = e.duree; BASE_YEAR = e.debut - 1; ECH = e.pib / 3000; POP_FR = e.pop;
  DETTE0 = e.dette; CHOM0 = e.chomage; INFL0 = e.inflation; INFL_TREND = e.inflTrend; GROWTH_POT = e.potentiel;
  TAUX0 = e.moyen; MARCHE0 = e.marche; MARCHE_DRIFT = e.marcheFin != null ? e.marcheFin - e.marche : 0; INFL_LINK = e.marcheFin != null ? 0 : (e.inflLink ?? 0.7); CUR_Y = 1; ERA_RATES = e.rates || {}; DISABLED = e.disabled || [];
  PRIMARY_BASE = +(e.solde + e.moyen * e.dette / 100).toFixed(2);
  TAUX_BASE = e.marche - TAUX_KDETTE * Math.max(0, e.dette - 100) - TAUX_KDEF * Math.max(0, -PRIMARY_BASE - 2);
  TAUX_MIN = Math.max(0, Math.min(2.5, e.marche - 1)); TAUX_MAX = Math.max(9, e.marche + 6);
  START = { ...START_TODAY, solde: e.solde, dette: e.dette, chomage: e.chomage, croissance: e.croissance, inflation: e.inflation };
  return e;
}

/* ============================================================
   CONTEXTE HISTORIQUE PAR ÉPOQUE : rappel, prédécesseur, résultats réels de fin de mandat
   (fin = situation à la fin de l'année d'élection suivante, mêmes sources que ERAS)
   ============================================================ */
const ERA_INFO = {
  giscard: { pred: "Alain Poher", predSituation: "président du Sénat, assure l'intérim depuis la mort du président Georges Pompidou, le 2 avril 1974",
    rappel: "Les « Trente Glorieuses » s'achèvent : depuis la guerre, la France a connu une forte croissance et un quasi plein emploi. Fin 1973, la guerre du Kippour provoque le premier choc pétrolier : le prix du pétrole est multiplié par quatre. Les prix s'envolent et l'activité ralentit. Le 2 avril 1974, le président Georges Pompidou meurt en fonctions ; Alain Poher assure l'intérim jusqu'à l'élection.",
    fin: { annee: 1981, dette: 22.0, solde: -2.4, chomage: 6.6, inflation: 13.4, note: "fin 1981 ; séries statistiques anciennes, comparaison de la dette à prendre avec prudence" } },
  mitterrand1: { pred: "Valéry Giscard d'Estaing", predSituation: "achève son septennat",
    rappel: "Le septennat qui s'achève a été marqué par deux chocs pétroliers (1973 et 1979). La croissance a ralenti, le chômage a franchi le million de personnes en 1977 et l'inflation reste supérieure à 10 % : c'est la « stagflation ». Les plans de rigueur de Raymond Barre, à partir de 1976, n'ont pas suffi à la vaincre. En mai 1981, la gauche arrive au pouvoir pour la première fois sous la Ve République.",
    fin: { annee: 1988, dette: 33.6, solde: -2.6, chomage: 8.9, inflation: 2.7 } },
  mitterrand2: { pred: "François Mitterrand", predSituation: "achève son premier septennat",
    rappel: "Après la relance de 1981-1982, le gouvernement a opéré en 1983 le « tournant de la rigueur » pour vaincre l'inflation et défendre le franc. De 1986 à 1988, la première cohabitation, avec Jacques Chirac comme Premier ministre, a privatisé de grandes entreprises. L'inflation est retombée sous 3 %, mais le chômage frôle 9 %.",
    fin: { annee: 1995, dette: 56.1, solde: -5.1, chomage: 10.0, inflation: 1.8 } },
  chirac1: { pred: "François Mitterrand", predSituation: "achève son second septennat",
    rappel: "Le septennat qui s'achève a connu la guerre du Golfe (1991), la création de la CSG (1991) et le traité de Maastricht (1992), qui fixe les conditions pour passer à la monnaie unique : un déficit inférieur à 3 % du PIB et une dette inférieure à 60 %. En 1993, la France a traversé une récession et une seconde cohabitation s'est ouverte, avec Édouard Balladur. Le chômage dépasse 10 %.",
    fin: { annee: 2002, dette: 60.3, solde: -3.2, chomage: 7.9, inflation: 1.9 } },
  chirac2: { pred: "Jacques Chirac", predSituation: "achève son septennat",
    rappel: "De 1997 à 2002, une troisième cohabitation, avec Lionel Jospin comme Premier ministre, a mis en place les 35 heures. La croissance a été forte à la fin des années 1990 et le chômage est redescendu sous 8 %. Le 1er janvier 2002, l'euro a remplacé le franc dans les porte-monnaie. Le mandat présidentiel passe désormais de sept à cinq ans.",
    fin: { annee: 2007, dette: 64.5, solde: -2.6, chomage: 8.0, inflation: 1.5 } },
  sarkozy: { pred: "Jacques Chirac", predSituation: "achève son second mandat",
    rappel: "Le quinquennat qui s'achève a été marqué par la canicule de 2003, la réforme des retraites de 2003, le « non » au référendum sur la Constitution européenne (2005), les émeutes urbaines de 2005 et le retrait du CPE (2006). La dette dépasse 60 % du PIB. Aux États-Unis, les premiers signes de la crise des crédits immobiliers « subprimes » apparaissent.",
    fin: { annee: 2012, dette: 90.6, solde: -5.0, chomage: 9.8, inflation: 2.0 } },
  hollande: { pred: "Nicolas Sarkozy", predSituation: "achève son quinquennat",
    rappel: "Le quinquennat qui s'achève a été bouleversé par la crise financière de 2008 : sauvetage des banques, plan de relance, puis récession en 2009. La dette est passée d'environ 64 % à 91 % du PIB. La réforme de 2010 a reporté l'âge légal de la retraite à 62 ans. Depuis 2010, la crise de la zone euro inquiète les marchés ; en janvier 2012, la France a perdu sa note « AAA » chez Standard & Poor's.",
    fin: { annee: 2017, dette: 98.4, solde: -2.8, chomage: 9.4, inflation: 1.0 } },
  macron1: { pred: "François Hollande", predSituation: "achève son quinquennat et a renoncé à se représenter",
    rappel: "Le quinquennat qui s'achève a commencé par des hausses d'impôts pour réduire le déficit, puis s'est tourné vers la baisse du coût du travail (CICE en 2013, pacte de responsabilité en 2014). La France a été frappée par les attentats de 2015. Le chômage reste proche de 10 % et la dette approche 100 % du PIB. Pour la première fois, un président sortant a renoncé à se représenter.",
    fin: { annee: 2022, dette: 111.0, solde: -4.8, chomage: 7.3, inflation: 5.2 } },
  macron2: { pred: "Emmanuel Macron", predSituation: "achève son premier quinquennat",
    rappel: "Le quinquennat qui s'achève a transformé l'ISF en impôt sur la fortune immobilière (2018), puis affronté le mouvement des « gilets jaunes » (2018-2019) et la pandémie de Covid-19 (2020), pendant laquelle l'État a dépensé massivement (« quoi qu'il en coûte »). La dette a dépassé 110 % du PIB. Début 2022, la guerre en Ukraine fait flamber les prix de l'énergie et l'inflation repart.",
    fin: { annee: 2025, dette: 115.6, solde: -5.1, chomage: 7.5, inflation: 1.0, note: "dernières données connues (2025)" } },
  today: { pred: "Emmanuel Macron", predSituation: "achève son second quinquennat — la Constitution lui interdit d'en briguer un troisième",
    rappel: "Depuis 2022, la France a connu une forte poussée d'inflation, une réforme des retraites portant l'âge légal à 64 ans (2023), puis une instabilité politique après la dissolution de l'Assemblée en 2024. Le déficit public reste supérieur à 5 % du PIB, la dette dépasse 115 %, et les taux auxquels l'État emprunte remontent vers 4,5 à 5 %.",
    fin: null },
};

/* ============================================================
   ÉVÉNEMENTS HISTORIQUES DATÉS (an = année du mandat, 1 = première)
   reel = index du choix le plus proche de ce qui a été fait ; reelTexte = ce qui s'est passé.
   Les effets incluent le choc subi quelle que soit la réponse.
   ============================================================ */
const HIST_EVENTS = {
  giscard: [
    { id: "h74_petrole", contexte: "La guerre du Kippour (octobre 1973) a opposé Israël à l'Égypte et à la Syrie. En représailles au soutien occidental à Israël, les pays producteurs de pétrole du Golfe ont quadruplé leur prix en quelques mois : c'est le premier « choc pétrolier ». La France importe alors la quasi-totalité du pétrole qu'elle consomme.", an: 1, type: "crise", title: "Le premier choc pétrolier", desc: "Depuis fin 1973, le prix du pétrole a été multiplié par quatre. Les prix flambent et l'activité ralentit : c'est la « stagflation ».",
      choices: [
        { label: "Freiner l'économie pour casser l'inflation (rigueur)", fx: { croissance: -1.2, inflation: -1.0, chomage: 0.6, solde: 0.3, popularite: -3 }, note: "Réduire la demande calme les prix, mais au prix d'un ralentissement et de chômage." },
        { label: "Soutenir l'activité par la dépense publique (relance)", fx: { croissance: -0.3, inflation: 1.5, chomage: 0.1, solde: -0.8, popularite: 2 }, note: "Face à un choc sur les coûts, la relance soutient l'emploi mais alimente surtout l'inflation." },
        { label: "Miser sur les économies d'énergie et le nucléaire", fx: { croissance: -0.8, inflation: 0.5, chomage: 0.3, solde: -0.4, environnement: 2 }, note: "Une réponse de long terme : réduire la dépendance au pétrole importé." },
      ], reel: 0, reelTexte: "En juin 1974, le gouvernement adopte un plan de « refroidissement » de l'économie contre l'inflation. Le programme électronucléaire lancé en mars 1974 est poursuivi." },
    { id: "h75_recession", contexte: "C'est la première fois depuis la Seconde Guerre mondiale que la production française recule une année entière. Le choc pétrolier de 1973 a renchéri les coûts de production partout en Europe, et la demande mondiale s'effondre.", an: 2, type: "crise", title: "1975 : la récession", desc: "Pour la première fois depuis la guerre, la production recule et le chômage grimpe rapidement.",
      choices: [
        { label: "Plan de relance par l'investissement public", fx: { croissance: 0.2, chomage: 0.2, solde: -1.0, inflation: 0.8, popularite: 2 }, note: "La relance soutient l'activité, mais creuse le déficit." },
        { label: "Maintenir la rigueur pour protéger le franc", fx: { croissance: -1.5, chomage: 0.9, solde: 0.2, inflation: -0.6, popularite: -3 }, note: "La rigueur protège la monnaie mais aggrave la récession." },
        { label: "Aides ciblées aux entreprises en difficulté", fx: { croissance: -0.6, chomage: 0.5, solde: -0.5, integrite: -1 }, note: "Un soutien limité, moins coûteux mais moins efficace." },
      ], reel: 0, reelTexte: "En septembre 1975, le gouvernement de Jacques Chirac lance un plan de relance financé par le déficit. L'activité repart en 1976, mais l'inflation reste élevée." },
    { id: "h76_secheresse", contexte: "L'été 1976 reste l'un des plus secs du XXe siècle en France : plusieurs mois sans pluie significative, des rivières à sec, des récoltes de céréales et de fourrage dévastées. Les éleveurs, privés de quoi nourrir leur bétail, sont particulièrement touchés.", an: 3, type: "climat", title: "La grande sécheresse de 1976", desc: "Un été exceptionnellement sec ruine de nombreuses récoltes. Les agriculteurs réclament de l'aide.",
      choices: [
        { label: "Créer un impôt exceptionnel pour indemniser les agriculteurs", fx: { popularite: -2, cohesion: 2 }, note: "Financer une aide par un impôt dédié évite de creuser le déficit." },
        { label: "Indemniser en empruntant", fx: { solde: -0.3, popularite: 2, cohesion: 1 }, note: "Une aide rapide, payée par la dette." },
        { label: "Ne pas intervenir", fx: { popularite: -4, cohesion: -3 }, note: "L'inaction face à une catastrophe est mal vécue." },
      ], reel: 0, reelTexte: "Le gouvernement crée un « impôt sécheresse », une majoration exceptionnelle de l'impôt sur le revenu, pour financer l'aide aux agriculteurs." },
    { id: "h76_barre", contexte: "Raymond Barre, économiste reconnu, devient Premier ministre en août 1976 avec pour mission prioritaire de juguler l'inflation, alors supérieure à 9 % par an. Son nom restera associé à la rigueur budgétaire des années 1976-1981.", an: 3, type: "social", title: "Un plan contre l'inflation", desc: "L'inflation dépasse 9 % et le franc est attaqué. Le nouveau Premier ministre, Raymond Barre, propose un plan de lutte contre la hausse des prix.",
      choices: [
        { label: "Geler les prix et freiner les salaires (rigueur)", fx: { inflation: -1.2, croissance: -0.4, chomage: 0.3, solde: 0.5, popularite: -4 }, note: "Le blocage des prix agit vite, mais ne règle pas les causes de l'inflation." },
        { label: "Indexer les salaires sur les prix", fx: { inflation: 0.8, cohesion: 2, croissance: 0.1 }, note: "Protéger le pouvoir d'achat peut entretenir une spirale prix-salaires." },
        { label: "Laisser faire et soutenir la consommation", fx: { inflation: 1.0, popularite: 2, solde: -0.3 }, note: "Plus agréable à court terme, mais l'inflation s'installe." },
      ], reel: 0, reelTexte: "Le plan Barre (septembre 1976) gèle les prix pendant trois mois, freine les hausses de salaires et cherche à rééquilibrer le budget. L'inflation reste pourtant proche de 10 %." },
    { id: "h77_chomage", contexte: "Le chômage, resté marginal pendant les Trente Glorieuses (moins de 500 000 personnes au début des années 1970), a doublé en quelques années sous l'effet du ralentissement économique consécutif au choc pétrolier. Les jeunes sans qualification sont les premiers touchés.", an: 4, type: "social", title: "Le cap du million de chômeurs", desc: "Le chômage a franchi le million de personnes. Les jeunes sont les plus touchés.",
      choices: [
        { label: "Exonérer de cotisations les entreprises qui embauchent des jeunes", fx: { chomage: -0.3, solde: -0.3, popularite: 2 }, note: "Baisser le coût du travail des jeunes favorise leur embauche." },
        { label: "Lancer de grands travaux publics", fx: { chomage: -0.2, croissance: 0.3, solde: -0.5 }, note: "L'investissement public crée des emplois, à crédit." },
        { label: "Ne rien changer", fx: { chomage: 0.3, popularite: -3 }, note: "Le chômage de masse s'installe." },
      ], reel: 0, reelTexte: "En 1977, le premier « pacte national pour l'emploi des jeunes » exonère de cotisations sociales les entreprises qui embauchent des jeunes." },
    { id: "h79_petrole", contexte: "La révolution iranienne (1978-1979), qui renverse le Shah et installe une République islamique, interrompt les exportations de pétrole du pays. Combiné à la guerre Iran-Irak qui éclatera en 1980, cela provoque un second choc pétrolier, aussi brutal que celui de 1973.", an: 6, type: "crise", title: "Le second choc pétrolier", desc: "La révolution iranienne fait de nouveau flamber le prix du pétrole. L'inflation repart.",
      choices: [
        { label: "Maintenir la rigueur", fx: { croissance: -1.0, inflation: 1.0, chomage: 0.5, solde: 0.2, popularite: -3 }, note: "Tenir la monnaie et le budget, au prix d'un chômage croissant." },
        { label: "Relancer pour protéger l'emploi", fx: { croissance: -0.2, inflation: 2.5, chomage: 0.1, solde: -0.8, popularite: 1 }, note: "Comme en 1974, la relance nourrit surtout l'inflation." },
        { label: "Plan d'économies d'énergie", fx: { croissance: -0.6, inflation: 1.5, chomage: 0.3, solde: -0.3, environnement: 2 }, note: "Réduire la consommation de pétrole limite la facture." },
      ], reel: 0, reelTexte: "Le gouvernement Barre maintient sa politique de rigueur ; l'inflation dépasse 13 % en 1980 et le chômage continue de monter." },
  ],
  mitterrand1: [
    { id: "h81_relance", contexte: "Élu sur un programme de rupture avec la politique de rigueur de Raymond Barre, François Mitterrand applique dès l'été 1981 le programme commun de la gauche : hausse du SMIC, des prestations familiales et du minimum vieillesse, 150 000 emplois publics créés.", an: 1, type: "social", title: "Relancer par le pouvoir d'achat ?", desc: "Le nouveau pouvoir veut relancer l'économie par la consommation et l'emploi public.",
      choices: [
        { label: "Relance massive : hausse du SMIC, des allocations et embauches publiques", fx: { croissance: 0.8, chomage: -0.2, soldeDur: -1.0, inflation: 1.0, popularite: 5, cohesion: 3 }, note: "Si une partie de la demande part en importations, la relance profite aux autres pays." },
        { label: "Relance modérée et ciblée", fx: { croissance: 0.3, solde: -0.4, inflation: 0.3, popularite: 2 }, note: "Moins d'effet, mais moins de risques." },
        { label: "Priorité à la lutte contre l'inflation", fx: { croissance: -0.5, inflation: -1.0, chomage: 0.4, popularite: -4 }, note: "La rigueur dès le départ, contraire aux promesses." },
      ], reel: 0, reelTexte: "Dès 1981, le SMIC est relevé d'environ 10 %, les allocations et le minimum vieillesse augmentent et l'État recrute. Une partie de la demande profite aux importations, le déficit extérieur se creuse et le franc est dévalué dès octobre 1981." },
    { id: "h82_nationalisations", contexte: "Nationaliser de grands pans de l'industrie et de la finance est une promesse historique de la gauche française, portée depuis le Front populaire de 1936. En 1982, l'État devient actionnaire majoritaire de groupes comme Saint-Gobain, Rhône-Poulenc, Thomson ou Pechiney, ainsi que de la quasi-totalité du secteur bancaire.", an: 2, type: "opportunite", title: "Nationaliser les grandes entreprises ?", desc: "Le programme prévoit de nationaliser de grands groupes industriels et des banques.",
      choices: [
        { label: "Nationaliser de grands groupes et les banques", fx: { solde: -0.5, cohesion: 2, croissance: -0.1 }, note: "L'État devient actionnaire, mais doit indemniser les anciens propriétaires." },
        { label: "Prendre seulement des participations", fx: { solde: -0.2 }, note: "Un contrôle partiel, moins coûteux." },
        { label: "Ne pas nationaliser", fx: { popularite: -2 }, note: "Renoncer à une promesse de campagne." },
      ], reel: 0, reelTexte: "La loi de février 1982 nationalise cinq grands groupes industriels, 39 banques et deux compagnies financières." },
    { id: "h82_retraite", contexte: "Avant 1982, il fallait attendre 65 ans pour toucher une retraite à taux plein (sauf exceptions). L'abaissement à 60 ans est une mesure emblématique du premier septennat de Mitterrand, porté par le ministre du Travail Nicole Questiaux puis Pierre Bérégovoy.", an: 2, type: "social", title: "La retraite à 60 ans ?", desc: "L'âge légal de la retraite est de 65 ans. Le gouvernement propose de l'abaisser.",
      choices: [
        { label: "Abaisser l'âge légal à 60 ans", fx: { popularite: 5, cohesion: 3, soldeDur: -0.5, chomage: -0.1 }, note: "Une avancée sociale, mais un coût durable pour les régimes de retraite." },
        { label: "Garder 65 ans", fx: { popularite: -3 }, note: "Préserver les comptes, au prix d'une promesse non tenue." },
        { label: "Départs anticipés selon la pénibilité", fx: { popularite: 2, soldeDur: -0.2 }, note: "Un compromis ciblé." },
      ], reel: 0, reelTexte: "En 1982, l'âge légal de départ à la retraite passe de 65 à 60 ans, à partir d'avril 1983." },
    { id: "h83_tournant", contexte: "Pendant presque deux ans, le gouvernement a hésité entre deux voies : poursuivre la relance par la demande, quitte à sortir du Système monétaire européen (SME) et isoler la France, ou rester arrimé à l'Europe au prix d'un effort de rigueur. Le choix de mars 1983, porté par Jacques Delors, marque un tournant durable de la politique économique française.", an: 3, type: "crise", title: "Le franc attaqué : changer de cap ?", desc: "Le franc est attaqué et le déficit extérieur se creuse. Faut-il quitter le Système monétaire européen (SME) pour poursuivre la relance, ou changer de cap ? Le SME lie les monnaies européennes entre elles : le franc doit rester dans une marge étroite face au mark allemand ; s'il baisse trop, il faut dévaluer.",
      choices: [
        { label: "Rester dans le SME et passer à la rigueur", fx: { inflation: -2.0, croissance: -0.6, chomage: 0.5, soldeDur: 1.2, popularite: -5 }, note: "La rigueur fait reculer l'inflation, mais le chômage monte." },
        { label: "Quitter le SME et dévaluer fortement", fx: { inflation: 2.0, croissance: 0.3, integrite: -2, popularite: -1 }, note: "Une dévaluation redonne de la compétitivité, mais renchérit les importations." },
        { label: "Poursuivre la relance", fx: { inflation: 1.5, solde: -0.8, popularite: 1, croissance: 0.3 }, note: "Le déficit extérieur et l'inflation continuent de s'aggraver." },
      ], reel: 0, reelTexte: "En mars 1983, la France reste dans le SME : nouvelle dévaluation, plan de rigueur de Jacques Delors et fin de l'indexation automatique des salaires sur les prix. L'inflation reflue nettement les années suivantes." },
    { id: "h86_privatisations", contexte: "Les élections législatives de mars 1986 donnent la majorité à la droite, qui contraint François Mitterrand à nommer Jacques Chirac Premier ministre : c'est la première « cohabitation » de la Ve République, un président et un gouvernement de bords politiques opposés.", an: 6, type: "opportunite", title: "Cohabitation : privatiser ?", desc: "Après les législatives de 1986, une majorité opposée au président gouverne. Elle veut privatiser de grandes entreprises.",
      choices: [
        { label: "Laisser le gouvernement privatiser", fx: { solde: 0.4, dette: -1.0, cohesion: -1 }, note: "Les ventes rapportent de l'argent à l'État et réduisent la dette." },
        { label: "S'opposer aux privatisations", fx: { popularite: 1, integrite: 1, croissance: -0.1 }, note: "Le président dispose de peu de pouvoirs face à la majorité." },
        { label: "Accepter des privatisations limitées", fx: { solde: 0.2 }, note: "Un compromis." },
      ], reel: 0, reelTexte: "La cohabitation s'ouvre : le gouvernement de Jacques Chirac privatise de grandes entreprises (Saint-Gobain, Paribas, TF1…). Le président refuse de signer les ordonnances, qui passent alors par la loi." },
    { id: "h87_krach", contexte: "Le 19 octobre 1987, surnommé « lundi noir », les Bourses mondiales perdent plus de 20 % en une seule séance, la plus forte baisse depuis 1929. Contrairement aux craintes de l'époque, il ne débouchera pas sur une récession mondiale.", an: 7, type: "crise", title: "Le krach boursier d'octobre 1987", desc: "Les Bourses mondiales s'effondrent en quelques jours.",
      choices: [
        { label: "Garder son sang-froid et laisser les marchés se stabiliser", fx: { croissance: -0.2 }, note: "Un krach ne provoque pas toujours de récession." },
        { label: "Lancer un plan de soutien", fx: { solde: -0.5, croissance: 0.2 }, note: "Une précaution coûteuse." },
        { label: "Suspendre les privatisations", fx: { solde: -0.2 }, note: "Vendre dans un marché qui s'effondre rapporte moins." },
      ], reel: 0, reelTexte: "Le krach d'octobre 1987 n'entraîne pas de récession : la croissance reste solide en 1988. Le programme de privatisations est ralenti." },
  ],
  mitterrand2: [
    { id: "h88_rmi", contexte: "Avant 1988, les personnes sans ressources et sans droit au chômage n'avaient aucun filet de sécurité garanti. Le RMI, porté par le gouvernement de Michel Rocard, est l'ancêtre du RSA actuel (créé en 2009).", an: 1, type: "social", title: "Créer un revenu minimum ?", desc: "La pauvreté et l'exclusion progressent. Faut-il garantir un revenu minimum ?",
      choices: [
        { label: "Créer un revenu minimum d'insertion", fx: { soldeDur: -0.3, cohesion: 4, inegalites: -3, popularite: 2 }, note: "Un filet de sécurité pour les plus pauvres." },
        { label: "Renforcer les aides existantes", fx: { soldeDur: -0.2, cohesion: 2 }, note: "Moins ambitieux, moins coûteux." },
        { label: "Ne rien créer", fx: { cohesion: -2 }, note: "L'exclusion continue de progresser." },
      ], reel: 0, reelTexte: "Le revenu minimum d'insertion (RMI) est créé en décembre 1988, voté quasiment à l'unanimité." },
    { id: "h89_isf", contexte: "L'impôt sur les grandes fortunes (IGF), créé en 1982, avait été supprimé par le gouvernement Chirac en 1987 au nom de la compétitivité. Sa recréation sous un nouveau nom, l'ISF, symbolise le retour de la gauche au pouvoir après la cohabitation.", an: 2, type: "opportunite", title: "Taxer les grandes fortunes ?", desc: "L'impôt sur les grandes fortunes a été supprimé en 1987. Faut-il en recréer un ?",
      choices: [
        { label: "Créer un impôt de solidarité sur la fortune", fx: { soldeDur: 0.1, inegalites: -2, popularite: 1, croissance: -0.05 }, note: "Un impôt symbolique de redistribution, au faible rendement." },
        { label: "Taxer davantage les successions", fx: { soldeDur: 0.1, inegalites: -1, popularite: -1 }, note: "Une autre façon de taxer le patrimoine." },
        { label: "Ne pas taxer la fortune", fx: { inegalites: 1 }, note: "Les écarts de patrimoine se creusent." },
      ], reel: 0, reelTexte: "L'impôt de solidarité sur la fortune (ISF) est créé en 1989, remplaçant l'impôt sur les grandes fortunes supprimé en 1987." },
    { id: "h90_golfe", contexte: "Le 2 août 1990, l'Irak de Saddam Hussein envahit le Koweït, son voisin pétrolier. Une coalition internationale menée par les États-Unis, à laquelle la France participe (opération Daguet), libère le Koweït en février 1991.", an: 3, type: "international", title: "La guerre du Golfe", desc: "L'Irak envahit le Koweït. Le pétrole flambe et une coalition internationale se forme.",
      choices: [
        { label: "Participer à la coalition et soutenir l'économie", fx: { inflation: 0.8, croissance: -0.5, solde: -0.3, popularite: 2 }, note: "Un engagement militaire a un coût budgétaire." },
        { label: "Participer et économiser ailleurs", fx: { inflation: 0.8, croissance: -0.6, popularite: -1 }, note: "Tenir le budget malgré la guerre." },
        { label: "Ne pas intervenir", fx: { inflation: 0.8, croissance: -0.5, integrite: -2 }, note: "Rester à l'écart isole sur la scène internationale." },
      ], reel: 0, reelTexte: "La France participe à la coalition internationale (1991). La flambée du pétrole est brève, mais la croissance ralentit." },
    { id: "h91_csg", contexte: "Avant 1991, la Sécurité sociale était financée presque exclusivement par des cotisations assises sur les salaires, ce qui renchérissait le coût du travail. La CSG, créée par le gouvernement Rocard, élargit le financement à tous les revenus (salaires, mais aussi pensions, revenus du capital…).", an: 4, type: "opportunite", title: "Financer la Sécurité sociale autrement ?", desc: "La Sécurité sociale est surtout financée par des cotisations sur les salaires, ce qui pèse sur l'emploi.",
      choices: [
        { label: "Créer une contribution sur tous les revenus (CSG)", fx: { soldeDur: 0.4, inegalites: -0.5, popularite: -2 }, note: "Faire contribuer aussi les revenus du capital et les pensions." },
        { label: "Augmenter les cotisations salariales", fx: { soldeDur: 0.4, chomage: 0.2, popularite: -2 }, note: "Cela renchérit encore le travail." },
        { label: "Emprunter", fx: { solde: -0.3 }, note: "Reporter le problème sur les générations futures." },
      ], reel: 0, reelTexte: "La contribution sociale généralisée (CSG) est créée en 1991 au taux de 1,1 % : elle porte sur presque tous les revenus, et pas seulement sur les salaires." },
    { id: "h92_maastricht", contexte: "Le traité de Maastricht, signé en février 1992, crée l'Union européenne et pose les bases de la future monnaie unique. Il fixe des critères stricts que les pays candidats devront respecter : déficit public sous 3 % du PIB, dette sous 60 %.", an: 5, type: "international", title: "Le traité de Maastricht", desc: "L'Europe prépare une monnaie unique. Pour y entrer, il faudra un déficit inférieur à 3 % du PIB et une dette inférieure à 60 %.",
      choices: [
        { label: "S'engager vers la monnaie unique et ses règles", fx: { integrite: 2, croissance: 0.1, popularite: -1 }, note: "Une monnaie forte et stable, mais des contraintes budgétaires." },
        { label: "Refuser le traité", fx: { popularite: 1, croissance: -0.2, integrite: -1 }, note: "Garder sa souveraineté monétaire, au risque de l'isolement." },
        { label: "Signer, mais reporter l'effort budgétaire", fx: { solde: -0.2 }, note: "Les règles finiront par s'imposer." },
      ], reel: 0, reelTexte: "Le traité de Maastricht est approuvé par référendum en septembre 1992, de justesse (environ 51 % de « oui »)." },
    { id: "h93_recession", contexte: "1993 est la pire année économique française depuis 1945 : le PIB recule, le chômage dépasse 11 %, et une crise monétaire frappe le Système monétaire européen à l'été. Édouard Balladur, nouveau Premier ministre de cohabitation, doit agir vite.", an: 6, type: "crise", title: "1993 : récession et crise monétaire", desc: "La France entre en récession. Le chômage s'envole et le déficit dérape.",
      choices: [
        { label: "Grand emprunt, hausse de la CSG et réforme des retraites", fx: { croissance: -1.2, chomage: 0.7, soldeDur: 0.2, dette: 1.0, popularite: -2 }, note: "Un mélange de financement exceptionnel et de réformes." },
        { label: "Relance par le déficit", fx: { croissance: -0.7, chomage: 0.5, solde: -1.0 }, note: "Amortir la crise en laissant filer le déficit." },
        { label: "Hausses d'impôts immédiates", fx: { croissance: -1.6, chomage: 0.9, solde: 0.6, popularite: -3 }, note: "Réduire le déficit en pleine récession l'aggrave." },
      ], reel: 0, reelTexte: "Le gouvernement d'Édouard Balladur lance un grand emprunt (110 milliards de francs), relève la CSG à 2,4 % et réforme les retraites du privé (durée de cotisation portée progressivement à 40 ans)." },
  ],
  chirac1: [
    { id: "h95_tva", contexte: "À un an de l'échéance de Maastricht (1997), la France doit réduire son déficit sous 3 % du PIB pour espérer entrer dans l'euro. La hausse de la TVA, votée dès l'été 1995, est l'un des premiers gestes du nouveau gouvernement Juppé.", an: 1, type: "opportunite", title: "Réduire le déficit pour l'euro", desc: "Le déficit dépasse 5 % du PIB, loin de l'objectif de 3 % fixé pour entrer dans l'euro.",
      choices: [
        { label: "Augmenter la TVA de 2 points", fx: { soldeDur: 0.8, inflation: 0.5, popularite: -4, inegalites: 1 }, note: "La TVA rapporte vite, mais pèse sur les ménages modestes." },
        { label: "Réduire les dépenses", fx: { soldeDur: 0.6, cohesion: -2, popularite: -2 }, note: "Des économies, au prix de services publics réduits." },
        { label: "Reporter l'effort", fx: { solde: -0.2 }, note: "L'objectif de l'euro s'éloigne." },
      ], reel: 0, reelTexte: "En août 1995, le taux normal de TVA passe de 18,6 % à 20,6 % pour réduire le déficit et préparer l'euro." },
    { id: "h95_greves", contexte: "Le plan Juppé veut réformer en profondeur la Sécurité sociale et aligner les régimes spéciaux de retraite (SNCF, RATP…) sur le régime général. Il déclenche en décembre 1995 le plus long mouvement de grève depuis 1968, paralysant les transports pendant trois semaines.", an: 1, type: "social", title: "Réforme de la Sécurité sociale et grandes grèves", desc: "Le gouvernement Juppé présente une réforme de la Sécurité sociale et des régimes spéciaux de retraite. Le pays est paralysé par les grèves.",
      choices: [
        { label: "Maintenir l'ensemble du plan", fx: { popularite: -6, cohesion: -5, soldeDur: 0.4 }, note: "Tenir bon, au risque d'un conflit long." },
        { label: "Retirer la réforme des régimes spéciaux, garder celle de la Sécurité sociale", fx: { popularite: -2, cohesion: -1, soldeDur: 0.2 }, note: "Un compromis pour sortir du conflit." },
        { label: "Tout retirer", fx: { popularite: 2, solde: -0.2, integrite: -1 }, note: "La paix sociale, sans réforme." },
      ], reel: 1, reelTexte: "Après trois semaines de grèves en décembre 1995, le gouvernement retire la réforme des régimes spéciaux mais maintient celle de la Sécurité sociale (création de la CRDS)." },
    { id: "h97_euro", contexte: "Après la dissolution surprise de l'Assemblée nationale par Jacques Chirac en avril 1997, les élections législatives portent la gauche au pouvoir : c'est la troisième cohabitation. Lionel Jospin, nouveau Premier ministre, doit redresser les comptes pour que la France entre dans l'euro dès son lancement, le 1er janvier 1999.", an: 3, type: "international", title: "Se qualifier pour l'euro", desc: "Pour entrer dans l'euro, le déficit doit passer sous 3 % du PIB dès 1997.",
      choices: [
        { label: "Surtaxe exceptionnelle sur l'impôt des grandes entreprises", fx: { solde: 0.5, croissance: -0.1 }, note: "Un effort temporaire porté par les entreprises." },
        { label: "Couper dans les dépenses", fx: { solde: 0.5, cohesion: -2 }, note: "Un effort porté par les services publics." },
        { label: "Accepter de rater l'euro", fx: { integrite: -3, croissance: -0.2 }, note: "La France resterait à l'écart de la monnaie unique." },
      ], reel: 0, reelTexte: "Après la dissolution de 1997, le gouvernement Jospin instaure une surtaxe exceptionnelle sur l'impôt des sociétés. Le déficit passe sous 3 % et la France se qualifie pour l'euro en 1998." },
    { id: "h98_35h", contexte: "Réduire le temps de travail pour partager l'emploi est une idée ancienne de la gauche, déjà expérimentée avec les 39 heures en 1982. Les lois Aubry, du nom de la ministre du Travail Martine Aubry, généralisent les 35 heures à la quasi-totalité des entreprises.", an: 4, type: "social", title: "Les 35 heures ?", desc: "Le chômage dépasse 10 %. Faut-il réduire la durée du travail pour partager l'emploi ?",
      choices: [
        { label: "Passer à 35 heures avec des aides aux entreprises", fx: { chomage: -0.4, soldeDur: -0.4, popularite: 3, croissance: -0.1 }, note: "Partager le travail, avec des allègements de cotisations pour compenser." },
        { label: "Laisser chaque branche négocier", fx: { chomage: -0.1 }, note: "Une approche plus souple et plus lente." },
        { label: "Garder 39 heures", fx: { popularite: -2 }, note: "Pas de coût, pas d'effet." },
      ], reel: 0, reelTexte: "Les lois Aubry (1998 et 2000) fixent la durée légale du travail à 35 heures, avec des allègements de cotisations pour les entreprises." },
    { id: "h99_tempetes", contexte: "Les tempêtes Lothar (26 décembre) et Martin (27 décembre 1999) frappent la France avec des vents dépassant 200 km/h par endroits. Elles abattent l'équivalent de trois années de récolte de bois et privent des millions de foyers d'électricité pendant plusieurs semaines.", an: 5, type: "climat", title: "Les tempêtes de décembre 1999", desc: "Deux tempêtes dévastent la France : forêts détruites, millions de foyers privés d'électricité.",
      choices: [
        { label: "Grand plan d'aide aux sinistrés et à la forêt", fx: { solde: -0.2, cohesion: 3, popularite: 2 }, note: "La solidarité nationale face aux catastrophes." },
        { label: "Aides limitées", fx: { solde: -0.1, cohesion: 1 }, note: "Un soutien minimal." },
        { label: "S'en remettre aux assurances", fx: { cohesion: -3, popularite: -3 }, note: "Beaucoup de dégâts ne sont pas assurés." },
      ], reel: 0, reelTexte: "Les tempêtes Lothar et Martin (décembre 1999) font d'énormes dégâts ; l'État débloque des aides d'urgence et un plan pour la forêt." },
    { id: "h00_cagnotte", contexte: "À la fin des années 1990, la croissance économique est forte (plus de 3 % par an) et les recettes fiscales dépassent largement les prévisions du budget. Ce surplus inattendu, surnommé « la cagnotte », alimente un débat politique sur son utilisation.", an: 6, type: "opportunite", title: "La « cagnotte » fiscale", desc: "Grâce à la forte croissance, les impôts rapportent plus que prévu. Que faire de ce surplus ?",
      choices: [
        { label: "Baisser les impôts", fx: { soldeDur: -0.4, popularite: 3, croissance: 0.2 }, note: "Rendre l'argent aux contribuables soutient la demande." },
        { label: "Réduire le déficit", fx: { solde: 0.5 }, note: "Profiter des bonnes années pour assainir les comptes." },
        { label: "Augmenter les dépenses publiques", fx: { soldeDur: -0.4, cohesion: 2 }, note: "Renforcer les services publics." },
      ], reel: 0, reelTexte: "Le gouvernement utilise le surplus pour baisser plusieurs impôts, dont la TVA, ramenée à 19,6 % en avril 2000." },
  ],
  chirac2: [
    { id: "h02_ir", contexte: "Baisser l'impôt sur le revenu était une promesse centrale de la campagne de Jacques Chirac en 2002, dans un contexte de reprise économique après le ralentissement de 2001.", an: 1, type: "opportunite", title: "Baisser l'impôt sur le revenu ?", desc: "La baisse de l'impôt sur le revenu était une promesse de campagne. Mais la croissance ralentit.",
      choices: [
        { label: "Baisser l'impôt sur le revenu de 5 %", fx: { soldeDur: -0.2, popularite: 2, inegalites: 1 }, note: "Une baisse qui profite surtout aux ménages imposables." },
        { label: "Priorité à la réduction du déficit", fx: { soldeDur: 0.2, popularite: -2 }, note: "Renoncer à une promesse pour tenir les comptes." },
        { label: "Baisser plutôt les cotisations sur les bas salaires", fx: { soldeDur: -0.2, chomage: -0.1 }, note: "Favoriser l'emploi peu qualifié." },
      ], reel: 0, reelTexte: "Dès 2002, l'impôt sur le revenu baisse de 5 %, conformément aux promesses de campagne." },
    { id: "h03_canicule", contexte: "La canicule d'août 2003 est la plus meurtrière qu'ait connue la France depuis un siècle : les températures dépassent 40°C pendant plusieurs jours, et le système de santé, pris au dépourvu (notamment l'absence de personnel en plein mois d'août), est submergé.", an: 2, type: "climat", title: "La canicule d'août 2003", desc: "Une vague de chaleur exceptionnelle frappe la France. De nombreuses personnes âgées meurent.",
      choices: [
        { label: "Plan canicule et « journée de solidarité » travaillée pour financer l'aide aux personnes âgées", fx: { popularite: -1, cohesion: 2 }, note: "Une journée de travail supplémentaire non payée finance l'autonomie." },
        { label: "Financer l'aide aux personnes âgées par le déficit", fx: { solde: -0.2, cohesion: 1 }, note: "Une aide rapide, à crédit." },
        { label: "Ne rien changer", fx: { cohesion: -3, popularite: -4 }, note: "L'émotion est immense dans le pays." },
      ], reel: 0, reelTexte: "La canicule d'août 2003 cause environ 15 000 décès. Une « journée de solidarité » travaillée est créée en 2004 pour financer l'aide aux personnes âgées." },
    { id: "h03_retraites", contexte: "La réforme Fillon de 2003 est la première grande réforme des retraites depuis celle de 1993 (qui ne concernait que le secteur privé). Elle vise à répondre au vieillissement de la population et à l'allongement de l'espérance de vie.", an: 2, type: "social", title: "Réformer les retraites des fonctionnaires ?", desc: "Le vieillissement de la population menace l'équilibre des retraites.",
      choices: [
        { label: "Allonger à 40 ans la durée de cotisation des fonctionnaires", fx: { soldeDur: 0.3, popularite: -4, cohesion: -3 }, note: "Aligner public et privé, malgré les grèves." },
        { label: "Augmenter les cotisations", fx: { soldeDur: 0.3, chomage: 0.1, popularite: -2 }, note: "Faire payer davantage les actifs." },
        { label: "Ne pas réformer", fx: { soldeDur: -0.2 }, note: "Le déficit des retraites se creuse." },
      ], reel: 0, reelTexte: "La réforme Fillon (2003) aligne progressivement la durée de cotisation des fonctionnaires sur celle du privé, malgré d'importantes grèves." },
    { id: "h05_emeutes", contexte: "La mort de deux adolescents, Zyed Benna et Bouna Traoré, électrocutés en se cachant d'un contrôle de police à Clichy-sous-Bois, déclenche trois semaines d'émeutes urbaines dans de nombreuses villes françaises, les plus importantes depuis mai 1968.", an: 4, type: "social", title: "Les émeutes de novembre 2005", desc: "Après la mort de deux adolescents, des émeutes éclatent dans de nombreuses banlieues.",
      choices: [
        { label: "Fermeté (état d'urgence) et plan pour l'emploi dans les quartiers", fx: { solde: -0.2, popularite: 2, cohesion: 1 }, note: "Rétablir l'ordre et agir sur les causes." },
        { label: "Seulement un plan pour les quartiers", fx: { solde: -0.3, cohesion: 2, popularite: -1 }, note: "Traiter les causes, au risque de paraître laxiste." },
        { label: "Seulement la fermeté", fx: { popularite: 2, cohesion: -3 }, note: "L'ordre revient, les problèmes restent." },
      ], reel: 0, reelTexte: "Après trois semaines d'émeutes, l'état d'urgence est déclaré et des mesures pour l'emploi des jeunes des quartiers sont annoncées." },
    { id: "h06_cpe", contexte: "Le contrat première embauche (CPE), destiné à faciliter l'embauche des jeunes en assouplissant les règles de licenciement, provoque un vaste mouvement de contestation étudiante et lycéenne au printemps 2006, rappelant par son ampleur les mobilisations de 1968 et 1986.", an: 5, type: "social", title: "Le contrat première embauche (CPE)", desc: "Un nouveau contrat pour les moins de 26 ans, plus facile à rompre, déclenche de grandes manifestations étudiantes.",
      choices: [
        { label: "Maintenir le CPE", fx: { popularite: -6, cohesion: -4, chomage: -0.1 }, note: "Tenir bon face à la rue." },
        { label: "Retirer le CPE", fx: { popularite: -1, integrite: -1 }, note: "Sortir de la crise en renonçant à la réforme." },
        { label: "Le modifier profondément", fx: { popularite: -3, cohesion: -1 }, note: "Un compromis difficile." },
      ], reel: 1, reelTexte: "Face aux manifestations, le CPE, pourtant voté, est retiré en avril 2006." },
  ],
  sarkozy: [
    { id: "h07_tepa", contexte: "La loi « travail, emploi, pouvoir d'achat » (TEPA), votée dès l'été 2007, concrétise le slogan de campagne de Nicolas Sarkozy « travailler plus pour gagner plus ». Le bouclier fiscal, qui plafonne les impôts directs à 50 % des revenus, fait particulièrement débat.", an: 1, type: "opportunite", title: "Le « paquet fiscal »", desc: "Le nouveau pouvoir veut « travailler plus pour gagner plus » et alléger les impôts.",
      choices: [
        { label: "Défiscaliser les heures supplémentaires, renforcer le bouclier fiscal, alléger les successions", fx: { soldeDur: -0.6, croissance: 0.1, inegalites: 2, popularite: 1 }, note: "Des baisses d'impôts coûteuses, inégalement réparties." },
        { label: "Des mesures ciblées sur le pouvoir d'achat des modestes", fx: { soldeDur: -0.3, inegalites: -1, popularite: 1 }, note: "Moins coûteux, plus redistributif." },
        { label: "Priorité au déficit", fx: { solde: 0.2, popularite: -2 }, note: "Renoncer aux promesses fiscales." },
      ], reel: 0, reelTexte: "La loi TEPA (août 2007) défiscalise les heures supplémentaires, renforce le bouclier fiscal (impôts plafonnés à 50 % des revenus) et allège les droits de succession." },
    { id: "h08_banques", contexte: "La faillite de la banque américaine Lehman Brothers, le 15 septembre 2008, déclenche la panique sur les marchés financiers mondiaux : les banques, ne sachant plus qui détient des actifs toxiques, cessent de se prêter entre elles. C'est le point culminant de la crise des « subprimes », née aux États-Unis en 2007.", an: 2, type: "crise", title: "La crise financière mondiale", desc: "La faillite de la banque Lehman Brothers déclenche une panique. Les banques ne se prêtent plus entre elles.",
      choices: [
        { label: "Garantir et soutenir les banques", fx: { croissance: -1.8, chomage: 0.5, solde: -0.5, dette: 2, integrite: -1, popularite: -1 }, note: "Éviter l'effondrement du système bancaire, avec l'argent public." },
        { label: "Laisser les banques faire faillite", fx: { croissance: -3.0, chomage: 1.2, popularite: -4 }, note: "Le risque d'une dépression comme en 1929." },
        { label: "Nationaliser les banques en difficulté", fx: { croissance: -1.5, chomage: 0.5, solde: -0.6, dette: 3 }, note: "L'État prend le contrôle, et les risques." },
      ], reel: 0, reelTexte: "À l'automne 2008, l'État garantit les prêts entre banques et leur apporte des fonds propres pour éviter l'effondrement du système financier." },
    { id: "h09_recession", contexte: "2009 est la pire récession mondiale depuis la Seconde Guerre mondiale : le commerce international s'effondre, et presque tous les pays développés voient leur production reculer fortement.", an: 3, type: "crise", title: "2009 : la récession", desc: "La production recule fortement et le chômage grimpe.",
      choices: [
        { label: "Plan de relance (investissements publics, prime à la casse)", fx: { croissance: -2.8, chomage: 0.6, solde: -1.3 }, note: "Amortir la crise par la dépense publique." },
        { label: "Rigueur immédiate", fx: { croissance: -4.0, chomage: 1.3, solde: 0.0, popularite: -4 }, note: "Réduire le déficit en pleine crise aggrave la récession." },
        { label: "Baisse temporaire de la TVA", fx: { croissance: -3.0, chomage: 0.8, solde: -1.1 }, note: "Soutenir la consommation par les prix." },
      ], reel: 0, reelTexte: "Un plan de relance de 26 milliards d'euros est lancé (investissements publics, prime à la casse). Le PIB recule pourtant de près de 3 % en 2009." },
    { id: "h10_retraites", contexte: "Comme en 2003, le vieillissement démographique pousse à une nouvelle réforme des retraites. Celle de 2010 porte l'âge légal de départ de 60 à 62 ans, provoquant d'importantes manifestations à l'automne.", an: 4, type: "social", title: "Reculer l'âge de la retraite ?", desc: "Les régimes de retraite sont en fort déficit après la crise.",
      choices: [
        { label: "Reporter l'âge légal de 60 à 62 ans", fx: { soldeDur: 0.3, popularite: -5, cohesion: -3 }, note: "Une économie durable, très contestée." },
        { label: "Augmenter les cotisations", fx: { soldeDur: 0.3, chomage: 0.1, popularite: -2 }, note: "Faire payer les actifs." },
        { label: "Ne pas réformer", fx: { soldeDur: -0.3 }, note: "Le déficit des retraites s'accumule." },
      ], reel: 0, reelTexte: "La réforme de 2010 porte progressivement l'âge légal de départ de 60 à 62 ans, malgré d'importantes manifestations." },
    { id: "h11_zoneeuro", contexte: "La crise de la dette grecque, révélée fin 2009, se propage à d'autres pays européens (Irlande, Portugal, Espagne, Italie) et menace l'existence même de la zone euro. Les marchés financiers doutent de la capacité de plusieurs États, dont la France, à rembourser leur dette.", an: 5, type: "international", title: "La crise de la zone euro", desc: "La Grèce est au bord de la faillite. Les marchés doutent de plusieurs pays européens, dont la France.",
      choices: [
        { label: "Plans de rigueur (hausses d'impôts et économies)", fx: { soldeDur: 0.6, croissance: -0.3, popularite: -3 }, note: "Rassurer les marchés, au prix de la croissance." },
        { label: "Laisser filer le déficit", fx: { solde: -0.3, integrite: -2, croissance: -0.2 }, note: "Le risque d'une hausse des taux d'intérêt." },
        { label: "Aider la Grèce sans effort budgétaire", fx: { solde: -0.2, integrite: 1 }, note: "La solidarité européenne a un coût." },
      ], reel: 0, reelTexte: "Le gouvernement Fillon adopte deux plans de rigueur (août et novembre 2011). En janvier 2012, l'agence Standard & Poor's retire à la France sa note « AAA »." },
  ],
  hollande: [
    { id: "h12_impots", contexte: "François Hollande est élu en mai 2012 sur une promesse de rééquilibrage des finances publiques par la justice fiscale. Dès son arrivée, le gouvernement Ayrault augmente fortement les impôts sur les hauts revenus et les grandes entreprises.", an: 1, type: "opportunite", title: "Redresser les comptes", desc: "Le déficit atteint 5 % du PIB. Le nouveau pouvoir veut le réduire rapidement.",
      choices: [
        { label: "Par des hausses d'impôts sur les ménages aisés et les entreprises", fx: { soldeDur: 0.8, croissance: -0.3, popularite: -4, inegalites: -2 }, note: "Des recettes rapides, mais un frein à la croissance." },
        { label: "Par des baisses de dépenses", fx: { soldeDur: 0.6, cohesion: -2, popularite: -3 }, note: "Moins d'impôts, mais moins de services." },
        { label: "Reporter l'effort", fx: { solde: -0.2, integrite: -1 }, note: "Les règles européennes ne seront pas tenues." },
      ], reel: 0, reelTexte: "En 2012-2013, les impôts augmentent fortement : nouvelle tranche à 45 % de l'impôt sur le revenu et taxe temporaire de 75 % sur les rémunérations au-delà d'un million d'euros." },
    { id: "h13_cice", contexte: "Face à la dégradation de la compétitivité des entreprises françaises, pointée notamment par le rapport Gallois (novembre 2012), le gouvernement crée le CICE pour réduire le coût du travail sans toucher directement aux cotisations sociales.", an: 2, type: "opportunite", title: "Baisser le coût du travail ?", desc: "Les entreprises françaises perdent en compétitivité et le chômage monte.",
      choices: [
        { label: "Créer un crédit d'impôt pour la compétitivité et l'emploi (CICE)", fx: { soldeDur: -0.5, chomage: -0.2, croissance: 0.2, inegalites: 1 }, note: "Environ 20 milliards d'euros par an pour baisser le coût du travail." },
        { label: "Baisser directement les cotisations patronales", fx: { soldeDur: -0.5, chomage: -0.2 }, note: "Le même objectif, de façon plus simple." },
        { label: "Ne rien faire", fx: { chomage: 0.2 }, note: "La compétitivité continue de se dégrader." },
      ], reel: 0, reelTexte: "Le crédit d'impôt pour la compétitivité et l'emploi (CICE) entre en vigueur en 2013 : environ 20 milliards d'euros par an de baisse du coût du travail." },
    { id: "h14_pacte", contexte: "Annoncé par François Hollande en janvier 2014, le pacte de responsabilité marque un tournant vers une politique plus favorable aux entreprises, au grand dam d'une partie de la gauche qui y voit un reniement.", an: 3, type: "social", title: "Le pacte de responsabilité", desc: "Le chômage dépasse 10 %. Faut-il aller plus loin dans la baisse des charges ?",
      choices: [
        { label: "Nouvelles baisses de charges financées par 50 milliards d'économies", fx: { soldeDur: 0.3, popularite: -3, cohesion: -1, chomage: -0.1 }, note: "Un tournant vers l'offre, contesté dans la majorité." },
        { label: "Relancer la demande", fx: { solde: -0.5, croissance: 0.3, popularite: 2 }, note: "Soutenir la consommation." },
        { label: "Garder le cap actuel", fx: {}, note: "Pas de nouvelle réforme." },
      ], reel: 0, reelTexte: "Le pacte de responsabilité (2014) prévoit de nouvelles baisses de cotisations patronales, financées par 50 milliards d'euros d'économies sur trois ans." },
    { id: "h15_attentats", contexte: "La France est frappée par deux vagues d'attentats islamistes en 2015 : contre Charlie Hebdo et l'Hyper Cacher en janvier, puis au Bataclan, au Stade de France et sur les terrasses parisiennes en novembre, faisant 130 morts. L'état d'urgence est déclaré pour la première fois depuis la guerre d'Algérie.", an: 4, type: "crise", title: "Les attentats de 2015", desc: "La France est frappée par des attentats meurtriers.",
      choices: [
        { label: "Renforcer fortement la sécurité, quitte à dépasser les objectifs de déficit", fx: { solde: -0.2, popularite: 4, cohesion: 3 }, note: "La sécurité avant les règles budgétaires." },
        { label: "Renforcer la sécurité à budget constant", fx: { popularite: 2, cohesion: 1 }, note: "Redéployer des moyens existants." },
        { label: "Mesures limitées", fx: { popularite: -4, cohesion: -2 }, note: "L'opinion attend une réponse forte." },
      ], reel: 0, reelTexte: "Après les attentats de 2015, l'état d'urgence est déclaré et les moyens de la police, de la justice et des armées sont renforcés." },
    { id: "h16_loitravail", contexte: "La loi Travail, portée par la ministre Myriam El Khomri, veut donner plus de place à la négociation d'entreprise face à la loi. Elle provoque des mois de manifestations au printemps 2016 et est adoptée sans vote grâce à l'article 49.3 de la Constitution.", an: 5, type: "social", title: "Réformer le code du travail ?", desc: "Une réforme du droit du travail, plus favorable à la négociation dans les entreprises, provoque des mois de manifestations.",
      choices: [
        { label: "Adopter la réforme malgré la contestation", fx: { popularite: -4, cohesion: -3, chomage: -0.1 }, note: "Le recours à l'article 49.3 permet l'adoption sans vote." },
        { label: "Retirer la réforme", fx: { popularite: 1, integrite: -1 }, note: "La paix sociale, sans réforme." },
        { label: "La modifier fortement", fx: { popularite: -2, cohesion: -1 }, note: "Un compromis." },
      ], reel: 0, reelTexte: "La loi Travail est adoptée en 2016 grâce à l'article 49.3, après des mois de manifestations." },
  ],
  macron1: [
    { id: "h17_isf", contexte: "Dès son arrivée, Emmanuel Macron tient une promesse de campagne controversée : recentrer l'ISF sur le seul patrimoine immobilier (devenant l'IFI) et instaurer une flat tax de 30 % sur les revenus du capital, pour encourager l'investissement dans les entreprises.", an: 1, type: "opportunite", title: "Transformer l'ISF ?", desc: "Le nouveau pouvoir veut encourager l'investissement en allégeant la fiscalité du capital.",
      choices: [
        { label: "Remplacer l'ISF par un impôt sur la seule fortune immobilière et taxer le capital à taux unique", fx: { soldeDur: -0.2, croissance: 0.1, inegalites: 2, popularite: -2 }, note: "Favoriser l'investissement, au risque d'être accusé de cadeau aux riches." },
        { label: "Maintenir l'ISF", fx: {}, note: "Le statu quo." },
        { label: "Renforcer l'ISF", fx: { soldeDur: 0.1, inegalites: -1, croissance: -0.1 }, note: "Plus de redistribution, au risque de départs de contribuables." },
      ], reel: 0, reelTexte: "À partir de 2018, l'ISF est remplacé par l'impôt sur la fortune immobilière (IFI), et les revenus du capital sont taxés à un taux unique de 30 %." },
    { id: "h18_giletsjaunes", contexte: "Le mouvement des « gilets jaunes », né sur les réseaux sociaux en réaction à une hausse de la taxe carbone sur les carburants, se transforme en une contestation sociale inédite, avec des manifestations chaque samedi pendant plusieurs mois à partir de novembre 2018.", an: 2, type: "social", title: "Les « gilets jaunes »", desc: "La hausse de la taxe sur les carburants déclenche un mouvement de colère inédit, chaque samedi.",
      choices: [
        { label: "Annuler la hausse de la taxe carbone et prendre des mesures pour le pouvoir d'achat", fx: { soldeDur: -0.4, popularite: 3, cohesion: 3, environnement: -2 }, note: "Environ 10 milliards d'euros pour apaiser la colère." },
        { label: "Maintenir la taxe carbone", fx: { popularite: -6, cohesion: -5, environnement: 2 }, note: "Tenir l'objectif climatique, malgré la crise." },
        { label: "Ne rien céder", fx: { popularite: -5, cohesion: -6, integrite: -2 }, note: "Le conflit s'enlise." },
      ], reel: 0, reelTexte: "La hausse de la taxe carbone est annulée et des mesures d'environ 10 milliards d'euros sont annoncées (prime d'activité, heures supplémentaires défiscalisées)." },
    { id: "h19_retraites", contexte: "Le projet de système universel de retraites par points veut remplacer les 42 régimes existants par un système unique. Il provoque la plus longue grève des transports depuis 1968, de décembre 2019 à début 2020, avant d'être suspendu par l'arrivée de la pandémie.", an: 3, type: "social", title: "Une retraite universelle par points ?", desc: "Le gouvernement veut fusionner les régimes de retraite en un système universel. Une longue grève éclate.",
      choices: [
        { label: "Avancer malgré la grève", fx: { popularite: -4, cohesion: -3 }, note: "Une réforme d'architecture, longue à mettre en place." },
        { label: "Négocier et ralentir", fx: { popularite: -1 }, note: "Un compromis." },
        { label: "Abandonner", fx: { popularite: 1, integrite: -1 }, note: "Renoncer à une promesse de campagne." },
      ], reel: 0, reelTexte: "Le projet provoque une longue grève fin 2019 ; adopté en première lecture par l'article 49.3, il est suspendu en mars 2020 à cause de la pandémie." },
    { id: "h20_covid", contexte: "Déclarée pandémie mondiale par l'OMS en mars 2020, le Covid-19 pousse la quasi-totalité des pays du monde à confiner leur population. La formule « quoi qu'il en coûte », prononcée par Emmanuel Macron le 12 mars 2020, résume l'ampleur du soutien public à l'économie.", an: 4, type: "sante", title: "La pandémie de Covid-19", desc: "Un virus se propage dans le monde entier. Les hôpitaux sont débordés.",
      choices: [
        { label: "Confiner et soutenir massivement l'économie (« quoi qu'il en coûte »)", fx: { croissance: -3.0, solde: -3.0, dette: 6, chomage: 0.2, popularite: 2, cohesion: 2 }, note: "Chômage partiel et prêts garantis protègent emplois et entreprises." },
        { label: "Confiner avec des aides limitées", fx: { croissance: -3.5, solde: -1.0, chomage: 1.5, cohesion: -3 }, note: "Moins de dette, mais des faillites et du chômage." },
        { label: "Éviter le confinement", fx: { croissance: -1.5, popularite: -8, cohesion: -5, integrite: -3 }, note: "Un coût humain très lourd." },
      ], reel: 0, reelTexte: "En 2020, la France confine sa population et finance massivement le chômage partiel et les prêts garantis. Le PIB recule d'environ 8 % et le déficit atteint environ 9 % du PIB." },
    { id: "h21_relance", contexte: "Après le choc économique de 2020, l'Union européenne débloque un plan de relance commun sans précédent. En France, « France Relance » vise à la fois à soutenir l'activité à court terme et à préparer la transition écologique et numérique.", an: 5, type: "opportunite", title: "Un plan de relance ?", desc: "L'économie redémarre après la pandémie. Faut-il l'accompagner ?",
      choices: [
        { label: "Plan de relance de 100 milliards d'euros, dont la transition écologique", fx: { solde: -0.8, croissance: 1.0, chomage: -0.4, environnement: 3 }, note: "Accompagner la reprise et préparer l'avenir." },
        { label: "Relance modérée", fx: { solde: -0.3, croissance: 0.4 }, note: "Un soutien plus prudent." },
        { label: "Retour rapide à l'équilibre", fx: { solde: 0.4, croissance: -0.5, chomage: 0.3 }, note: "Le risque de casser la reprise." },
      ], reel: 0, reelTexte: "Le plan « France Relance » (100 milliards d'euros, dont 30 pour la transition écologique) accompagne une forte reprise en 2021." },
  ],
  macron2: [
    { id: "h22_bouclier", contexte: "L'invasion de l'Ukraine par la Russie, le 24 février 2022, fait exploser les prix du gaz et de l'électricité en Europe, la Russie étant un fournisseur majeur. Le bouclier tarifaire, mis en place dès l'automne 2021 puis renforcé, protège les consommateurs français au prix d'un coût très élevé pour l'État.", an: 1, type: "crise", title: "L'inflation et la crise de l'énergie", desc: "La guerre en Ukraine fait flamber les prix du gaz et de l'électricité.",
      choices: [
        { label: "Bouclier tarifaire : limiter la hausse des prix de l'énergie", fx: { solde: -1.2, inflation: -1.0, popularite: 3 }, note: "L'inflation reste contenue, pour un coût élevé." },
        { label: "Chèque énergie ciblé sur les ménages modestes", fx: { solde: -0.4, inflation: 0.5, cohesion: 1 }, note: "Moins cher, plus ciblé." },
        { label: "Laisser les prix monter", fx: { inflation: 1.5, popularite: -5, cohesion: -3 }, note: "Le pouvoir d'achat s'effondre." },
      ], reel: 0, reelTexte: "Le bouclier tarifaire limite la hausse des prix de l'électricité et du gaz : l'inflation française reste parmi les plus faibles de la zone euro, pour un coût de plusieurs dizaines de milliards d'euros." },
    { id: "h23_retraites", contexte: "Comme en 2003 et 2010, le financement des retraites pousse à une nouvelle réforme. Celle de 2023, repoussant l'âge légal de 62 à 64 ans, est adoptée sans vote grâce à l'article 49.3 et provoque d'importantes mobilisations syndicales pendant plusieurs mois.", an: 2, type: "social", title: "Reculer l'âge de la retraite à 64 ans ?", desc: "Le gouvernement veut reporter l'âge légal pour équilibrer les régimes de retraite.",
      choices: [
        { label: "Reporter l'âge légal à 64 ans", fx: { soldeDur: 0.3, popularite: -6, cohesion: -4 }, note: "Une économie durable, très contestée." },
        { label: "Allonger seulement la durée de cotisation", fx: { soldeDur: 0.2, popularite: -3, cohesion: -2 }, note: "Un effort plus progressif." },
        { label: "Ne pas réformer", fx: { soldeDur: -0.2 }, note: "Le déficit des retraites persiste." },
      ], reel: 0, reelTexte: "La réforme de 2023, adoptée grâce à l'article 49.3 malgré de grandes manifestations, porte progressivement l'âge légal de 62 à 64 ans." },
    { id: "h24_derapage", contexte: "En 2024, les prévisions de recettes fiscales se révèlent nettement trop optimistes : la croissance est plus faible qu'attendu, les rentrées d'impôt sur les sociétés s'effondrent, et le déficit s'envole bien au-delà de l'objectif initial. La dissolution de l'Assemblée nationale par Emmanuel Macron, en juin 2024, plonge le pays dans une instabilité politique inédite.", an: 3, type: "crise", title: "Le déficit dérape", desc: "Les recettes fiscales sont bien plus faibles que prévu. Le déficit s'envole.",
      choices: [
        { label: "Annuler 10 milliards de crédits en cours d'année", fx: { solde: 0.3, popularite: -2 }, note: "Des économies rapides, mais limitées." },
        { label: "Laisser filer le déficit", fx: { solde: -0.4, integrite: -2 }, note: "Les marchés et Bruxelles s'inquiètent." },
        { label: "Augmenter les impôts", fx: { solde: 0.5, croissance: -0.2, popularite: -4 }, note: "Contraire aux engagements pris." },
      ], reel: 0, reelTexte: "En février 2024, 10 milliards d'euros de crédits sont annulés. Le déficit 2024 dérape pourtant à près de 6 % du PIB, et la dissolution de l'Assemblée en juin ouvre une période d'instabilité." },
    { id: "h25_budget", contexte: "Sans majorité absolue à l'Assemblée depuis les élections législatives de 2024, voter un budget devient un exercice périlleux : plusieurs gouvernements se succèdent, et le budget 2025 n'est finalement adopté qu'au forceps, après la chute du gouvernement Barnier sur une motion de censure en décembre 2024.", an: 4, type: "opportunite", title: "Un budget pour réduire le déficit", desc: "Sans majorité stable, il faut pourtant voter un budget qui réduise le déficit.",
      choices: [
        { label: "Économies et contributions exceptionnelles des grandes entreprises et des très hauts revenus", fx: { soldeDur: 0.6, croissance: -0.2, inegalites: -1, popularite: -1 }, note: "Répartir l'effort entre dépenses et impôts." },
        { label: "Seulement des économies", fx: { soldeDur: 0.5, cohesion: -2, popularite: -2 }, note: "Un effort porté par les services publics." },
        { label: "Aucun effort", fx: { solde: -0.3, integrite: -2 }, note: "La dette continue de grimper." },
      ], reel: 0, reelTexte: "Le budget 2025, adopté début 2025 après la censure d'un gouvernement, combine économies et contributions exceptionnelles des grandes entreprises et des très hauts revenus." },
  ],
  today: [],
};

/* ============================================================
   AMBIANCE : « Nous sommes le… » (affichée à l'élection, après l'année conseil)
   Baguette : INSEE (2001-2024). SMIC : INSEE / Dares (1995-2026). Pas de chiffre non sourcé.
   ============================================================ */
const AMBIANCE = {
  giscard: { date: "Nous sommes le 19 mai 1974.", variants: [
    [ "La France compte environ 53 millions d'habitants et fait partie des cinq premières puissances économiques du monde.",
      "On paie en francs. Le salaire minimum (SMIC) vient d'être créé en 1970 ; début mai 1974, il s'élève à environ 1 031 francs par mois (157 € au taux de conversion fixe, mais avec un pouvoir d'achat bien supérieur à 157 € d'aujourd'hui, vu l'inflation depuis).",
      "Les « Trente Glorieuses » viennent de s'achever : depuis la guerre, le niveau de vie a fortement progressé et le chômage ne touche qu'environ 3 % des actifs.",
      "Mais depuis l'automne 1973, le pétrole coûte quatre fois plus cher : les prix augmentent de plus de 13 % par an.",
      "La majorité est encore fixée à 21 ans ; elle passera à 18 ans en juillet 1974.",
      "L'avortement est encore interdit : la loi Veil le dépénalisera en janvier 1975. La peine de mort est toujours en vigueur.",
      "La télévision compte trois chaînes, toutes publiques ; la couleur se répand peu à peu dans les foyers.",
      "Le téléphone fixe est loin d'être présent dans toutes les maisons.",
      "Le TGV n'existe pas encore et le Concorde n'a pas commencé ses vols commerciaux (1976).",
      "Ordinateur personnel, téléphone portable, internet : rien de tout cela n'existe encore.",
      "Aux États-Unis, le président Richard Nixon est empêtré dans le scandale du Watergate ; il démissionnera trois mois plus tard, en août 1974." ],
    [ "La France compte environ 53 millions d'habitants. L'élection se joue dans un climat de deuil : le président Georges Pompidou vient de mourir en fonctions, une première sous la Ve République.",
      "Le chantier du World Trade Center à New York vient de s'achever (avril 1973) ; en France, la tour Montparnasse, plus haute tour de Paris, est inaugurée cette même année 1973.",
      "Le Vietnam vient de signer les accords de paix de Paris (1973) ; les derniers soldats américains ont quitté le pays.",
      "Le cinéma français est dominé par des comédies populaires ; « Les Valseuses » sort cette année et fait scandale.",
      "La 2 CV et la Renault 4 sont parmi les voitures les plus vendues en France.",
      "Le Minitel n'existe pas encore (il sera testé à partir de 1978) ; pour appeler, on passe souvent par une opératrice.",
      "Le collège unique n'existe pas encore : il sera créé par la réforme Haby, en 1975.",
      "Le chauffage au fioul domine largement les foyers français ; le choc pétrolier qui vient de frapper va pousser à chercher des alternatives, dont le nucléaire.",
      "Aux États-Unis, Richard Nixon traverse la pire crise politique de sa présidence." ] ] },
  mitterrand1: { date: "Nous sommes le 10 mai 1981.", variants: [
    [ "La France compte environ 54 millions d'habitants et reste l'une des cinq premières puissances économiques du monde.",
      "Le SMIC mensuel brut est d'environ 2 898 francs (442 € au taux de conversion fixe, mais avec un pouvoir d'achat bien supérieur à 442 € d'aujourd'hui, vu l'inflation depuis).",
      "Les prix augmentent de plus de 13 % par an : l'inflation est la grande inquiétude des Français, avec le chômage qui touche plus de 6 % des actifs.",
      "Emprunter coûte très cher : l'État se finance à plus de 15 % sur dix ans.",
      "La peine de mort existe encore : elle sera abolie en octobre 1981.",
      "Les radios privées sont interdites ; les « radios libres » seront autorisées dans les mois qui viennent.",
      "Le TGV entrera en service entre Paris et Lyon en septembre 1981.",
      "Le baladeur à cassettes est à la mode ; le disque compact n'arrivera qu'en 1982, et le Minitel n'est pas encore entré dans les foyers.",
      "Internet et le téléphone portable relèvent de la science-fiction.",
      "La Communauté européenne compte dix pays ; l'Allemagne est coupée en deux et l'URSS existe toujours.",
      "Aux États-Unis, Ronald Reagan vient de prendre ses fonctions de président, en janvier 1981." ],
    [ "La France compte environ 54 millions d'habitants. François Mitterrand devient le premier président socialiste de la Ve République, dix ans après la fondation du Parti socialiste à Épinay (1971).",
      "Quelques semaines plus tôt, à peine un mois après son investiture, Ronald Reagan a survécu à une tentative d'assassinat (mars 1981).",
      "Le sida n'a pas encore de nom : les premiers cas sont décrits aux États-Unis en juin 1981.",
      "MTV, la première chaîne consacrée aux clips musicaux, vient de être lancée aux États-Unis (août 1981).",
      "En Pologne, le syndicat Solidarność, né l'année précédente, défie le pouvoir communiste.",
      "La guerre Iran-Irak, commencée en 1980, fait rage et pèse sur le prix du pétrole.",
      "Le minitel est testé depuis peu en Île-et-Vilaine ; il ne se généralisera qu'à partir de 1982.",
      "Le service militaire dure un an et reste obligatoire pour les jeunes hommes." ] ] },
  mitterrand2: { date: "Nous sommes le 8 mai 1988.", variants: [
    [ "La France compte environ 56 millions d'habitants et reste l'une des cinq premières puissances économiques du monde.",
      "Le SMIC mensuel brut est d'environ 4 813 francs (734 € au taux de conversion fixe, mais avec un pouvoir d'achat bien supérieur à 734 € d'aujourd'hui, vu l'inflation depuis).",
      "L'inflation est retombée sous 3 % : la bataille contre la hausse des prix des années 1980 est en passe d'être gagnée.",
      "Mais le chômage frôle 9 % des actifs.",
      "Le Minitel est installé dans des millions de foyers : on y consulte l'annuaire, les horaires de train ou des messageries.",
      "La télévision s'est ouverte au privé : TF1 a été privatisée en 1987, et l'on reçoit désormais six chaînes.",
      "Le disque compact remplace peu à peu le vinyle.",
      "Le mur de Berlin est toujours debout : il tombera en novembre 1989.",
      "Le tunnel sous la Manche est en construction ; il ouvrira en 1994.",
      "On paie en francs : l'euro n'existe pas. Internet et le téléphone portable ne sont pas encore entrés dans la vie des Français.",
      "Aux États-Unis, Ronald Reagan achève son second mandat de président." ],
    [ "La France compte environ 56 millions d'habitants. Mitterrand brigue un second septennat, face à son propre Premier ministre, Jacques Chirac : c'est la fin de la première cohabitation.",
      "Quelques jours avant le second tour, le 5 mai 1988, l'assaut de la grotte d'Ouvéa, en Nouvelle-Calédonie, met fin à une prise d'otages dramatique.",
      "Aux États-Unis, la campagne pour succéder à Reagan bat son plein ; George H. W. Bush sera élu en novembre 1988.",
      "L'explosion de la centrale de Tchernobyl, en Ukraine soviétique, remonte à deux ans (avril 1986) et a durablement marqué les esprits sur le nucléaire.",
      "Le film « Le Grand Bleu » de Luc Besson sortira quelques jours après l'élection et deviendra un immense succès populaire.",
      "Le Macintosh et les premiers ordinateurs personnels se répandent dans les entreprises, mais restent rares dans les foyers.",
      "La Coupe du monde de football approche (1990, en Italie) ; la France ne s'y est pas qualifiée." ] ] },
  chirac1: { date: "Nous sommes le 7 mai 1995.", variants: [
    [ "La France compte environ 58 millions d'habitants et fait partie des cinq premières puissances économiques du monde.",
      "Le SMIC mensuel brut est d'environ 6 250 francs (953 € au taux de conversion fixe de l'euro, soit un pouvoir d'achat un peu supérieur à celui de 953 € aujourd'hui).",
      "Le chômage dépasse 10 % des actifs : c'est la première préoccupation des Français.",
      "Le tunnel sous la Manche est ouvert depuis 1994.",
      "Internet fait ses tout premiers pas : très peu de foyers y sont connectés. Le téléphone portable existe, mais il reste rare et coûteux.",
      "Le service militaire est encore obligatoire pour les garçons.",
      "L'Union européenne compte quinze pays depuis janvier 1995.",
      "La monnaie unique est en préparation ; son nom, « euro », n'a pas encore été choisi.",
      "Aux États-Unis, Bill Clinton est président depuis 1993." ],
    [ "La France compte environ 58 millions d'habitants. François Mitterrand, malade, achève ses deux septennats : c'est la première élection sans président sortant depuis 1981.",
      "La Bosnie est en guerre depuis trois ans ; les accords de Dayton, qui y mettront fin, seront signés en novembre 1995.",
      "La Coupe du monde de rugby se joue en Afrique du Sud, un an après la fin de l'apartheid ; Nelson Mandela en est le symbole.",
      "Le film « Pulp Fiction » a marqué le cinéma l'année précédente ; « Toy Story », premier long-métrage entièrement en images de synthèse, sortira en fin d'année.",
      "Le CD-ROM et les débuts du World Wide Web font parler d'eux, mais le grand public n'est pas encore connecté.",
      "La France vient de reprendre ses essais nucléaires dans le Pacifique, suscitant de vives protestations internationales." ] ] },
  chirac2: { date: "Nous sommes le 5 mai 2002.", variants: [
    [ "La France compte environ 60 millions d'habitants et fait partie des cinq premières puissances économiques du monde.",
      "Depuis le 1er janvier, on paie en euros : 1 euro vaut 6,55957 francs.",
      "Fin 2001, une baguette coûtait en moyenne un peu plus de 4,30 francs, soit 0,66 €.",
      "Le SMIC horaire brut sera porté à 6,83 € au 1er juillet 2002.",
      "Les 35 heures s'étendent à toutes les entreprises, et le service militaire obligatoire a été supprimé.",
      "L'internet à haut débit commence à se répandre dans les foyers.",
      "Ni Facebook, ni YouTube, ni le smartphone n'existent encore.",
      "Aux États-Unis, George W. Bush est président depuis janvier 2001 ; les attentats du 11 septembre 2001 ont bouleversé les relations internationales." ],
    [ "La France compte environ 60 millions d'habitants. Cette élection reste dans l'Histoire : au premier tour, Jean-Marie Le Pen élimine le premier ministre sortant Lionel Jospin et se qualifie pour le second tour.",
      "De grandes manifestations « anti-Le Pen » rassemblent des millions de personnes entre les deux tours ; Jacques Chirac sera réélu le 5 mai avec plus de 82 % des voix.",
      "Les monnaies nationales (francs, marks, lires…) viennent de disparaître définitivement de la circulation, remplacées par l'euro depuis février 2002.",
      "Le scandale financier Enron, aux États-Unis, a éclaté quelques mois plus tôt (fin 2001) et ébranle la confiance dans les grandes entreprises.",
      "La guerre en Afghanistan, commencée après les attentats du 11-Septembre, se poursuit.",
      "Le premier épisode de « Star Academy » a été diffusé l'année précédente et lance la vague de téléréalité en France." ] ] },
  sarkozy: { date: "Nous sommes le 6 mai 2007.", variants: [
    [ "La France compte environ 64 millions d'habitants et fait partie des six premières puissances économiques du monde.",
      "Une baguette coûte en moyenne 0,80 €.",
      "Le SMIC horaire brut sera de 8,44 € en juillet 2007, soit environ 1 280 € par mois pour 35 heures.",
      "Le chômage touche environ 8 % des actifs.",
      "L'iPhone vient d'être présenté aux États-Unis ; il arrivera en France en novembre 2007. Facebook commence à peine à se faire connaître.",
      "L'Union européenne compte 27 pays depuis janvier 2007.",
      "Aux États-Unis, George W. Bush achève son second mandat de président ; les premières faillites liées aux crédits immobiliers « subprimes » inquiètent déjà les financiers." ],
    [ "La France compte environ 64 millions d'habitants. Nicolas Sarkozy l'emporte face à Ségolène Royal, première femme à accéder au second tour d'une présidentielle française.",
      "Le traité de Lisbonne, qui doit simplifier le fonctionnement de l'Union européenne après le « non » français de 2005, est en cours de négociation.",
      "YouTube, racheté par Google l'année précédente, change la manière de regarder des vidéos ; Twitter vient tout juste d'être lancé (2006).",
      "Le prix du baril de pétrole s'envole, en route vers un record historique l'année suivante (2008).",
      "La Fourme de Montbrison... plus sérieusement, le film « La Môme », sur Édith Piaf, triomphe au cinéma et vaudra un Oscar à Marion Cotillard.",
      "Le Kindle d'Amazon, premier lecteur de livres numériques à succès, vient d'être lancé aux États-Unis." ] ] },
  hollande: { date: "Nous sommes le 6 mai 2012.", variants: [
    [ "La France compte environ 65 millions d'habitants et fait partie des six premières puissances économiques du monde.",
      "Une baguette coûte en moyenne 0,87 €. Le SMIC brut sera de 1 425,70 € par mois en juillet 2012.",
      "Le chômage approche 10 % des actifs, et la dette publique approche 90 % du PIB.",
      "La crise de la zone euro fait rage : la Grèce est au bord de la faillite.",
      "En janvier, la France a perdu sa note « AAA » auprès de l'agence Standard & Poor's.",
      "Les smartphones se sont imposés ; Instagram existe depuis 2010.",
      "Aux États-Unis, Barack Obama est président depuis 2009." ],
    [ "La France compte environ 65 millions d'habitants. François Hollande bat le président sortant Nicolas Sarkozy : une alternance rare dès le premier mandat.",
      "Quelques jours plus tard, en Grèce, des élections législatives chaotiques illustrent la crise de confiance qui secoue la zone euro.",
      "Le « printemps arabe », commencé fin 2010, a renversé plusieurs régimes (Tunisie, Égypte, Libye) et continue de bouleverser le Proche-Orient.",
      "Les Jeux olympiques de Londres se préparent pour l'été 2012.",
      "Facebook vient d'entrer en Bourse et compte déjà plus de 900 millions d'utilisateurs dans le monde.",
      "En France, le débat sur le mariage pour tous, promesse de campagne du nouveau président, s'annonce comme l'un des grands chantiers du mandat." ] ] },
  macron1: { date: "Nous sommes le 7 mai 2017.", variants: [
    [ "La France compte environ 67 millions d'habitants et fait partie des six premières puissances économiques du monde.",
      "Une baguette coûte en moyenne 0,87 €. Le SMIC brut est de 1 480,27 € par mois.",
      "Le chômage dépasse 9 % des actifs et la dette publique approche 100 % du PIB.",
      "Emprunter n'a presque jamais coûté aussi peu : l'État se finance à moins de 1 % sur dix ans.",
      "En juin 2016, le Royaume-Uni a voté pour quitter l'Union européenne (le « Brexit »).",
      "Smartphones, réseaux sociaux et plateformes de vidéo font partie du quotidien.",
      "Personne n'a encore entendu parler du Covid-19, ni de ChatGPT.",
      "Aux États-Unis, Donald Trump vient de prendre ses fonctions de président, en janvier 2017." ],
    [ "La France compte environ 67 millions d'habitants. À 39 ans, Emmanuel Macron devient le plus jeune président de la Ve République, face à Marine Le Pen, avec un mouvement politique créé un an plus tôt.",
      "Son parti, La République en Marche, n'a pas encore de député : les élections législatives suivront en juin 1917.",
      "Donald Trump, élu en novembre 2016, vient de prendre ses fonctions de président des États-Unis, suscitant de vives inquiétudes en Europe.",
      "La série « Game of Thrones » touche à sa fin de diffusion ; le monde entier en discute chaque semaine.",
      "Les attentats de 2015 et 2016 (Bataclan, Nice) restent dans toutes les mémoires ; l'état d'urgence est toujours en vigueur en France.",
      "Les voitures électriques restent marginales ; Tesla vient tout juste de dépasser General Motors en valeur boursière." ] ] },
  macron2: { date: "Nous sommes le 24 avril 2022.", variants: [
    [ "La France compte environ 68 millions d'habitants et est la septième économie mondiale.",
      "Une baguette coûte en moyenne 0,93 €. Le SMIC brut est de 1 603,12 € par mois depuis janvier.",
      "La pandémie de Covid-19 s'éloigne, mais elle a laissé une dette supérieure à 110 % du PIB. Le télétravail est entré dans les habitudes.",
      "Depuis février, la guerre en Ukraine fait flamber les prix de l'énergie : l'inflation dépassera 5 % sur l'année.",
      "ChatGPT n'existe pas encore : il sera lancé en novembre 2022.",
      "Aux États-Unis, Joe Biden est président depuis janvier 2021." ],
    [ "La France compte environ 68 millions d'habitants. Emmanuel Macron est réélu face à Marine Le Pen, pour la seconde fois : une première depuis Jacques Chirac en 2002.",
      "L'invasion de l'Ukraine par la Russie, lancée le 24 février 2022, domine toute la campagne et bouleverse l'ordre européen.",
      "Elon Musk est en pleine négociation pour racheter Twitter, rachat qu'il finalisera quelques mois plus tard.",
      "Les Jeux olympiques d'hiver de Pékin viennent de s'achever (février 2022) ; Paris se prépare à accueillir les Jeux d'été 2024.",
      "Le variant Omicron du Covid-19 a provoqué une nouvelle vague cet hiver, mais les restrictions sanitaires s'allègent en France." ] ] },
  today: { date: "Nous sommes en mai 2027.", variants: [
    [ "La France compte environ 68,5 millions d'habitants et reste la septième économie mondiale.",
      "Une baguette coûte un peu plus d'un euro. Le SMIC brut est d'environ 1 867 € par mois depuis juin 2026.",
      "La dette dépasse 115 % du PIB, et l'État emprunte autour de 4,7 % sur dix ans.",
      "L'intelligence artificielle s'est invitée dans les entreprises, les écoles et les foyers.",
      "Canicules et sécheresses se multiplient avec le changement climatique." ] ] },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (n, d = 0) => (n ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d });

// Équivalence concrète d'un montant en Md€ : euros par habitant et par an
const parHabitant = (md) => (md * 1000) / POP_FR;   // €/habitant/an
const eqHab = (md) => `${md >= 0 ? "+" : ""}${fmt(parHabitant(md))} €/habitant`;

// Objectifs affichés en permanence (repères pour l'élève)
const OBJECTIFS = [
  { id: "inflation", label: "Inflation < 5 %", icon: "flame", ok: (i) => (i.inflation ?? 0) < 5, near: (i) => (i.inflation ?? 0) < 8, show: () => CURRENT_ERA.inflation >= 4 },
  { id: "deficit", label: "Déficit < 3 %", icon: "wallet", ok: (i) => i.solde > -3, near: (i) => i.solde > -5 },
  { id: "dette", label: "Dette maîtrisée", icon: "chart-line", ok: (i) => i.dette <= DETTE0, near: (i) => i.dette <= DETTE0 + 9 },
  { id: "chomage", label: "Chômage en baisse", icon: "briefcase", ok: (i) => i.chomage < CHOM0, near: (i) => i.chomage < CHOM0 + 1 },
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
  { id: "patrimoine", cat: "rec", label: "Impôt sur la fortune (ISF / IFI)", icon: "diamond",
    eur0: 4, eurStep: 3, rate0: null, unit: "", mult: 0.4,
    fx: { popularite: 1, cohesion: 1 }, cro: -0.04,
    hint: "Taxe les très gros patrimoines. Très redistributif et plutôt populaire, mais rapporte peu et peut pousser de grands contribuables à partir à l'étranger." },
  { id: "successions", cat: "rec", label: "Droits de succession et de donation", icon: "certificate",
    eur0: 19, eurStep: 6, rate0: null, unit: "", mult: 0.3,
    fx: { popularite: -2, cohesion: 1 },
    hint: "Taxe ce que l'on reçoit en héritage ou en don. Limite la transmission des inégalités d'une génération à l'autre, mais très impopulaire, même chez les ménages modestes." },
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
    eur0: 155, eurStep: 4, rate0: null, unit: "", mult: 1.0,
    fx: { popularite: 1, cohesion: 2 }, cho: -0.04,
    hint: "Dépense publique d'éducation (État + collectivités). Investissement dans le capital humain : rendement de long terme sur la croissance." },
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
    hint: "L'État finance des centaines d'agences et d'organismes publics (emploi, santé, environnement…). Baisser ce budget, c'est fusionner celles qui font le même travail ou en supprimer certaines : on économise, mais certaines missions peuvent être moins bien assurées." },
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
// Effet de chaque levier sur les INÉGALITÉS, par cran (+ = augmente les inégalités).
// Impôts progressifs (IR, patrimoine) et dépenses sociales réduisent les inégalités ;
// impôts régressifs (TVA, CSG, écolo) et coupes sociales les aggravent.
const INEG = {
  tva: 1.5, csg: 1.0, ir: -1.5, patrimoine: -2.0, successions: -1.5, is: -0.5, cotpat: -0.3, cotsal: 0.5, ecolo: 0.6,
  retraites: -1.0, sante: -1.2, education: -1.5, aides: -2.5, invest: -0.3, fonction: -0.4,
  subventions: 0.4, collectivites: -0.6,
};
const levEur = (lev, level) => ECH * ((lev.concave && (level || 0) > 0) ? lev.eur0 + lev.eurStep * Math.pow(level, 0.6) : Math.max(0, lev.eur0 + (level || 0) * lev.eurStep));
const levRate = (lev, level) => { const r0 = ERA_RATES[lev.id] ?? lev.rate0; return r0 == null ? null : r0 + (level || 0) * lev.rateStep; };

/* ---- Doctrines de départ (inspirées de vrais modèles) ---- */
// Leviers de l'année conseil : 5 recettes + 5 dépenses (mise en bouche)
const ESSENTIAL = ["tva", "ir", "csg", "is", "patrimoine", "retraites", "sante", "education", "aides", "invest"];
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
  { id: "fraude_fisc", type: "opportunite", title: "Lutte contre la fraude fiscale",
    desc: "Un rapport révèle des milliards d'impôts éludés par de grandes entreprises et des particuliers fortunés. L'opinion réclame des comptes.",
    choices: [
      { label: "Grand plan de contrôle fiscal (recruter des inspecteurs)", fx: { solde: 0.4, popularite: 3, croissance: -0.05 }, note: "Récupérer l'impôt éludé est populaire et rapporte un gain réel, mais limité : il faut des contrôleurs, du temps, et une partie de la fraude reste irrécupérable. Cela ne comble jamais le déficit à soi seul." },
      { label: "Quelques contrôles ciblés et médiatisés", fx: { solde: 0.15, popularite: 2 }, note: "Un effort modeste mais rapide et consensuel ; le rendement budgétaire reste faible." },
      { label: "Ne rien changer", fx: { popularite: -3, integrite: -2 }, note: "L'inaction face à la fraude fiscale est très mal perçue et nourrit le sentiment d'injustice." },
    ] },
  { id: "fraude_soc", type: "social", title: "Débat sur la fraude sociale",
    desc: "L'opposition réclame un grand plan contre les prestations sociales versées à tort (RSA, allocations…). Le sujet divise.",
    choices: [
      { label: "Renforcer fortement les contrôles des allocataires", fx: { solde: 0.15, popularite: 2, cohesion: -3 }, note: "Les montants récupérés sont faibles : la fraude sociale est bien moindre que la fraude fiscale. Et des contrôles trop zélés stigmatisent les plus modestes." },
      { label: "Croiser les fichiers sans stigmatiser", fx: { solde: 0.08, integrite: 1 }, note: "Approche technique et mesurée : un petit gain, sans heurter la cohésion." },
      { label: "Rappeler que la fraude sociale est marginale", fx: { popularite: -2, cohesion: 1 }, note: "Factuellement juste, mais une partie de l'opinion y voit du laxisme." },
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
  if (fx.soldeDur) n.solde = (n.solde || 0) + fx.soldeDur * mult; // mesure durable : effet immédiat… et chaque année ensuite
  return clampInd(n);
}
function clampInd(ind) {
  return {
    solde: clamp(ind.solde, -15, 6), dette: clamp(ind.dette, 0, 240),
    chomage: clamp(ind.chomage, 3, 20), croissance: clamp(ind.croissance, GROWTH_MIN, GROWTH_MAX),
    popularite: clamp(ind.popularite, 0, 100), cohesion: clamp(ind.cohesion, 0, 100),
    integrite: clamp(ind.integrite, 0, 100), environnement: clamp(ind.environnement, 0, 100),
    inegalites: clamp(ind.inegalites ?? 45, 0, 100),
    inflation: clamp(ind.inflation ?? INFL_TREND, -1, 20),
    ecart: clamp(ind.ecart ?? 0, -20, 10),
    soldeDur: clamp(ind.soldeDur ?? 0, -10, 10),
  };
}
function scale(fx, k) { const o = {}; for (const key in fx) o[key] = fx[key] * k; return o; }

// Rendement d'un levier selon son niveau. Les leviers "concave" (fraude) ont un
// rendement décroissant : les premiers crans rapportent, puis de moins en moins.
function gainLevier(lev, lvl) {
  if (!lvl) return 0;
  if (lev.concave && lvl > 0) return lev.eurStep * Math.pow(lvl, 0.6);
  return lev.eurStep * lvl;
}
// Solde PRIMAIRE (hors intérêts) apporté par les NIVEAUX cumulés
function balanceFromLevels(levels, doctrine) {
  let md = 0;
  for (const lev of LEVERS) {
    const eur = gainLevier(lev, levels[lev.id] || 0);
    md += lev.cat === "rec" ? eur : -eur;              // recette améliore le solde, dépense le dégrade
  }
  return md;
}

// Début d'année : réinitialise croissance & solde PRIMAIRE (hors charge de la dette)
function startYear(indPrev, year, doctrine) {
  const mod = doctrine?.mod || {};
  const dragCoef = 0.012 * (mod.dragRelief ? mod.dragRelief : 1);
  const drag = -dragCoef * Math.max(0, indPrev.dette - 90);
  CUR_Y = year;
  const e = CURRENT_ERA;
  if (e && e.inflFin != null && e.duree > 1) INFL_TREND = e.inflation + (e.inflFin - e.inflation) * (year - 1) / (e.duree - 1);
  const ecart = indPrev.ecart ?? 0;  // niveau de production par rapport au potentiel (en %)
  // Rattrapage : sous le potentiel, l'économie croît un peu plus vite ; le solde porte la trace du cycle.
  return { ...indPrev, croissance: GROWTH_POT + drag - 0.35 * ecart, solde: PRIMARY_BASE + 0.5 * ecart + (indPrev.soldeDur ?? 0) };
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
    if (INEG[lev.id]) ind.inegalites = clamp((ind.inegalites ?? 45) + INEG[lev.id] * d * IMPACT, 0, 100);
    if (lev.cro) ind.croissance = clamp(ind.croissance + lev.cro * d * IMPACT, GROWTH_MIN, GROWTH_MAX);
  }
  // Effet d'offre : l'investissement et l'éducation accumulés relèvent durablement
  // la croissance potentielle — rendement de long terme, bien visible.
  const supply = Math.min(0.10 * Math.max(0, levels.invest || 0) + 0.06 * Math.max(0, levels.education || 0), 0.8);
  ind.croissance = clamp(ind.croissance + (impulse / PIB) * 100 * IMPULSE_GAIN + supply, GROWTH_MIN, GROWTH_MAX);
  return { ind: clampInd(ind), balanceMd, impulse, changes };
}

// Clôture : chômage (Okun) → taux d'emprunt (marchés) → charge de la dette → dette → pénalités.
// À l'entrée, n.solde est le solde PRIMAIRE (hors intérêts). tauxPrev = taux de l'an dernier.
// Taux d'emprunt : les marchés réagissent à la dette et au déficit primaire.
// Calculé dès la validation du budget, pour que la charge soit intégrée tout de suite.
function computeMarche(marchePrev, dette, soldePrimaire, infl) {
  const prog = YEARS > 1 ? (CUR_Y - 1) / (YEARS - 1) : 0;
  const cible = TAUX_BASE + MARCHE_DRIFT * prog + INFL_LINK * ((infl ?? INFL0) - INFL0)
    + TAUX_KDETTE * Math.max(0, dette - 100)
    + TAUX_KDEF * Math.max(0, -soldePrimaire - 2)
    - TAUX_KCONF * Math.max(0, soldePrimaire);
  return +clamp(marchePrev + (cible - marchePrev) * TAUX_ADJ, TAUX_MIN, TAUX_MAX).toFixed(2);
}
// Taux MOYEN de la dette : chaque année, une partie des vieux emprunts arrive à échéance et doit être
// réempruntée au taux de marché, de même que le déficit de l'année. Le taux moyen rattrape donc
// progressivement le taux de marché : la charge d'intérêts monte même sans nouveau dérapage.
function computeMoyen(moyenPrev, marche, dette, soldePrimaire) {
  const deficit = Math.max(0, -(soldePrimaire - moyenPrev * dette / 100));
  const part = clamp(REFI_BASE + REFI_DEF * deficit / Math.max(dette, 1), 0, 1);
  return +(moyenPrev + (marche - moyenPrev) * part).toFixed(2);
}
// Clôture de l'année. À l'entrée, n.solde est DÉJÀ le solde TOTAL (charge de la dette comprise,
// appliquée à la validation du budget). taux = taux d'emprunt de l'année (pour l'alerte marchés).
function finalizeYear(ind0, taux = TAUX0, marche = MARCHE0) {
  let n = { ...ind0 };
  // Stabilisateurs automatiques : quand la croissance s'écarte du potentiel, recettes et dépenses réagissent
  const devG = n.croissance - GROWTH_POT;
  n.solde = clamp(n.solde + 0.5 * devG, -18, 8);
  n.ecart = clamp((ind0.ecart ?? 0) + devG, -20, 10);
  const ef = ERA_INFO[CURRENT_ERA.id]?.fin;
  const chomDrift = ef ? 0.6 * (ef.chomage - CURRENT_ERA.chomage) / CURRENT_ERA.duree : 0;
  n.chomage = clamp(n.chomage - 0.35 * devG + chomDrift, 2, 20);
  // Inflation : revient vers la tendance de l'époque, accélère si l'économie surchauffe
  const infPrev = n.inflation ?? INFL_TREND;
  n.inflation = clamp(infPrev + 0.4 * (INFL_TREND - infPrev) + 0.3 * (n.croissance - GROWTH_POT), -1, 20);

  // Dynamique de dette (% du PIB) : le déficit TOTAL s'ajoute, la croissance nominale dilue.
  // Vraie formule : dette diluée = dette / (1 + g) ; le déficit s'ajoute en plein.
  const nominalG = (n.croissance + n.inflation) / 100;
  n.dette = clamp(n.dette / (1 + nominalG) + (-n.solde), 0, 240);

  n.popularite = clamp(n.popularite - 0.6, 0, 100);      // usure du pouvoir
  n.environnement = clamp(n.environnement - 0.7, 0, 100);
  if ((n.inegalites ?? 45) > 58) n.cohesion = clamp(n.cohesion - ((n.inegalites - 58) * 0.06), 0, 100); // les inégalités minent la cohésion

  const flags = [];
  if (marche > 5.5) flags.push("taux");                  // les marchés s'affolent
  if (n.dette > 150) { n.croissance = clamp(n.croissance - 0.4, GROWTH_MIN, GROWTH_MAX); flags.push("defiance"); }
  if (n.cohesion < 25) { n.croissance = clamp(n.croissance - 0.3, GROWTH_MIN, GROWTH_MAX); n.popularite = clamp(n.popularite - 4, 0, 100); flags.push("emeutes"); }
  if (n.popularite < 22) flags.push("censure");
  if (n.integrite < 30) flags.push("scandale");
  return { ind: clampInd(n), flags };
}

// Générateur pseudo-aléatoire déterministe : même graine => même séquence.
function seededRandom(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Tirage des événements de l'année. Avec un code de classe (seed), l'ordre est le MÊME
// pour toutes les équipes de la classe : équité pour la notation. Sans seed : aléatoire.
const GENERIC_HIST = ["secheresse", "canicule", "hopital", "greve", "delocalisation", "lobby_agro", "lobby_finance", "lobby_energie", "ethique_emploi", "ethique_scandale", "fraude_fisc", "basezero"];
function drawEvents(year, usedIds, flags, seed = null, n = 3) {
  const forced = [];
  if (flags?.includes("scandale")) forced.push("ethique_scandale");
  if (flags?.includes("emeutes")) forced.push("banlieues");
  const rnd = seed ? seededRandom(seed + ":evts") : Math.random;
  // Ordre global de la classe, calculé une fois, identique pour tous
  const order = [...EVENTS];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const picks = [];
  // Événements historiques datés de l'époque (identiques pour tous)
  for (const h of (HIST_EVENTS[CURRENT_ERA.id] || [])) if (h.an === year && !usedIds.includes(h.id) && picks.length < n) picks.push({ ...h, hist: true });
  for (const id of forced) { const e = EVENTS.find((x) => x.id === id); if (e && !usedIds.includes(id) && picks.length < n) picks.push(e); }
  for (const e of order) {
    if (picks.length >= n) break;
    // Époques historiques : aucun grand événement inventé (pandémie, guerre…), seulement des situations plausibles à toute époque
    const anachro = CURRENT_ERA.id !== "today" && !GENERIC_HIST.includes(e.id);
    if (!usedIds.includes(e.id) && !forced.includes(e.id) && !anachro) picks.push(e);
  }
  // Les septennats peuvent épuiser leurs 6 événements historiques + génériques avant l'année 7 :
  // réutiliser un événement « plausible à toute époque » déjà vu plutôt que de n'en proposer aucun.
  if (picks.length < n && CURRENT_ERA.id !== "today") {
    for (const id of GENERIC_HIST) {
      if (picks.length >= n) break;
      const e = EVENTS.find((x) => x.id === id);
      if (e && !picks.some((p) => p.id === id)) picks.push(e);
    }
  }
  return picks.slice(0, n);
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
  const alertMap = { taux: "Les marchés s'affolent : votre taux d'emprunt grimpe, la charge de la dette explose — c'est l'effet boule de neige.", marches: "Les marchés financiers s'inquiètent de la dette : les taux d'intérêt montent.", defiance: "Défiance des créanciers : la croissance est bridée par la charge de la dette.", emeutes: "La fracture sociale a dégénéré en émeutes.", censure: "Attention : une motion de censure menace votre gouvernement.", scandale: "Un parfum de scandale entoure votre équipe : l'intégrité est en jeu." };
  const alerte = flags.map((f) => alertMap[f]).filter(Boolean);
  return { eco, social, alerte };
}

// Conseiller détaillé : relie les décisions de l'élève à leurs effets, explique le "pourquoi"
// avec les notions du programme, et donne un conseil pour l'année suivante.
const shortLabel = (l) => l.label.replace(/\s*\(.*\)\s*/g, "").trim();
function conseillerDetaille(before, after, flags, ctx) {
  const { year, levels = {}, prevLevels = {}, decisions = [], taux, tauxPrev, marche, marchePrev, chargeMd, chargePct, chargePctPrev } = ctx;
  const pedago = year === 1;
  const S = [];

  // 1. Vos décisions
  const changes = LEVERS.map((l) => ({ l, d: (levels[l.id] || 0) - (prevLevels[l.id] || 0) }))
    .filter((c) => c.d).map((c) => ({ ...c, eur: c.d * c.l.eurStep }))
    .sort((a, b) => Math.abs(b.eur) - Math.abs(a.eur));
  let dec;
  if (!changes.length) dec = "Vous n'avez modifié aucun levier : le budget a été reconduit à l'identique.";
  else {
    const parts = changes.slice(0, 3).map((c) => c.l.cat === "rec"
      ? `${c.d > 0 ? "augmenté" : "baissé"} l'impôt « ${shortLabel(c.l)} » (${c.eur > 0 ? "+" : "−"}${fmt(Math.abs(c.eur) * ECH, 0)} milliards d'euros de recettes)`
      : `${c.d > 0 ? "augmenté" : "réduit"} le budget « ${shortLabel(c.l)} » (${c.eur > 0 ? "+" : "−"}${fmt(Math.abs(c.eur) * ECH, 0)} milliards d'euros de dépenses)`);
    dec = `Cette année, vous avez ${parts.join(", ")}${changes.length > 3 ? `, et ${changes.length - 3} autre(s) changement(s)` : ""}.`;
  }
  if (decisions.length) dec += ` Face aux imprévus, vous avez choisi : ${decisions.map((x) => `« ${x.choice} » (${x.event.toLowerCase()})`).join(" ; ")}.`;
  S.push({ icon: "list-check", color: C.gold, t: "Ce que vous avez décidé", c: dec });

  // 2. Vos comptes publics — chaque composante est exprimée en évolution (points de PIB),
  // afin que la somme colle toujours à la variation réelle du solde (avant -> après).
  const dTotal = after.solde - before.solde;
  const dBudget = (balanceFromLevels(levels) - balanceFromLevels(prevLevels)) / SOLDE_DIV;
  const dEvents = decisions.reduce((a, x) => a + (x.solde || 0), 0);
  // La charge de la dette ne "coûte" que ce qu'elle coûte DE PLUS (ou de moins) que l'an dernier —
  // et non son montant total, qui existait déjà l'année précédente.
  const dCharge = (chargePct != null && chargePctPrev != null) ? chargePctPrev - chargePct : 0;
  const explained = dBudget + dEvents + dCharge;
  const residu = dTotal - explained; // stabilisateurs automatiques, effets reportés des années passées…
  let cpt = `Votre solde public passe de ${fmt(before.solde, 1)} % à ${fmt(after.solde, 1)} % du PIB${after.solde >= 0 ? " (un excédent !)" : ""}. `;
  if (pedago) cpt += `Rappel : un solde négatif (déficit), c'est ce que l'État dépense en plus de ce qu'il gagne dans l'année ; il doit l'emprunter. `;
  const why = [];
  if (Math.abs(dBudget) >= 0.1) why.push(`vos décisions budgétaires l'ont ${dBudget > 0 ? "amélioré" : "dégradé"} d'environ ${fmt(Math.abs(dBudget), 1)} point${Math.abs(dBudget) >= 2 ? "s" : ""}`);
  else if (changes.length) why.push(`vos décisions budgétaires se compensent presque : vos hausses de recettes financent vos nouvelles dépenses (ou l'inverse)`);
  if (Math.abs(dEvents) >= 0.1) why.push(`les imprévus l'ont ${dEvents > 0 ? "amélioré" : "dégradé"} d'environ ${fmt(Math.abs(dEvents), 1)} point${Math.abs(dEvents) >= 2 ? "s" : ""}`);
  if (chargePct != null && Math.abs(dCharge) >= 0.05) why.push(`les intérêts de la dette (${fmt(chargePctPrev, 1)} % → ${fmt(chargePct, 1)} % du PIB) l'ont ${dCharge > 0 ? "amélioré" : "dégradé"} d'environ ${fmt(Math.abs(dCharge), 1)} point${Math.abs(dCharge) >= 2 ? "s" : ""}`);
  if (Math.abs(residu) >= 0.15) why.push(`l'ajustement automatique de l'économie (l'activité a été ${residu > 0 ? "meilleure" : "moins bonne"} que prévu, ce qui change recettes et dépenses sans décision de votre part) l'a ${residu > 0 ? "amélioré" : "dégradé"} d'environ ${fmt(Math.abs(residu), 1)} point${Math.abs(residu) >= 2 ? "s" : ""}`);
  if (why.length) {
    const txt = why.length > 1 ? why.slice(0, -1).join(" ; ") + " ; et " + why[why.length - 1] : why[0];
    cpt += `Pourquoi ? ${txt.charAt(0).toUpperCase() + txt.slice(1)}. `;
  }
  if (after.dette > before.dette + 0.3) cpt += `La dette monte de ${fmt(before.dette, 0)} % à ${fmt(after.dette, 0)} % du PIB : tant que l'État est en déficit, il emprunte, et ces emprunts s'ajoutent à la dette.`;
  else if (after.dette < before.dette - 0.3) cpt += `La dette recule de ${fmt(before.dette, 0)} % à ${fmt(after.dette, 0)} % du PIB : votre déficit est assez faible pour que la croissance « dilue » la dette. Bravo, c'est difficile !`;
  else cpt += `La dette reste stable autour de ${fmt(after.dette, 0)} % du PIB.`;
  if (pedago) cpt += ` Retenez bien : le déficit est un flux (ce qui manque cette année), la dette est un stock (l'accumulation de tous les déficits passés).`;
  if (marche != null && marchePrev != null) {
    if (marche > marchePrev + 0.1) cpt += ` Attention : les marchés financiers s'inquiètent et vous prêtent plus cher (nouveaux emprunts : ${fmt(marchePrev, 1)} % → ${fmt(marche, 1)} %).`;
    else if (marche < marchePrev - 0.1) cpt += ` Bonne nouvelle : les marchés sont rassurés et vous prêtent moins cher (nouveaux emprunts : ${fmt(marchePrev, 1)} % → ${fmt(marche, 1)} %).`;
  }
  if (taux != null && tauxPrev != null && taux > tauxPrev + 0.05) {
    cpt += ` Le taux moyen de votre dette passe de ${fmt(tauxPrev, 2)} % à ${fmt(taux, 2)} % : chaque année, de vieux emprunts à taux bas arrivent à échéance et doivent être remplacés par de nouveaux, plus chers. C'est pour cela que la charge de la dette augmente, même sans nouvelle erreur de gestion.`;
    if (pedago && CURRENT_ERA.id === "today") cpt += ` Aujourd'hui, la France emprunte autour de 4,7 % sur 10 ans, alors qu'une partie de sa dette a été empruntée à 0-1 % il y a quelques années.`;
  }
  S.push({ icon: "wallet", color: C.coral, t: "Vos comptes publics", c: cpt });

  // Le front de l'inflation (époques où elle est au cœur de la bataille économique)
  if (CURRENT_ERA.inflation >= 4 || (before.inflation ?? 0) >= 4 || (after.inflation ?? 0) >= 4) {
    const bi = before.inflation ?? INFL0, ai = after.inflation ?? INFL0;
    let inf = `L'inflation passe de ${fmt(bi, 1)} % à ${fmt(ai, 1)} %. `;
    inf += ai < bi - 0.3 ? "Les prix ralentissent : bonne nouvelle pour le pouvoir d'achat, et les taux d'intérêt pourront baisser. " : ai > bi + 0.3 ? "Les prix s'emballent : les salaires et l'épargne perdent de leur valeur, et les taux d'intérêt restent élevés. " : "L'inflation est stable. ";
    if (pedago || year <= 2) inf += "C'est le cœur de la bataille économique de l'époque : quand les prix montent de 10 % par an, un salaire qui ne suit pas perd 10 % de pouvoir d'achat. Pour faire baisser l'inflation, on peut freiner la demande (rigueur), contenir les prix et les salaires, ou défendre la monnaie, au risque d'augmenter le chômage à court terme.";
    S.push({ icon: "flame", color: "#E0A96D", t: "Le front de l'inflation", c: inf });
  }

  // 3. Croissance et emploi
  let impulse = 0;
  for (const c of changes) impulse += (c.l.cat === "dep" ? 1 : -1) * c.eur * c.l.mult;
  let emp = `La croissance atteint ${fmt(after.croissance, 1)} % et le chômage passe de ${fmt(before.chomage, 1)} % à ${fmt(after.chomage, 1)} %. `;
  if (impulse > 3) emp += `Globalement, votre budget a soutenu l'activité : plus de dépenses ou moins d'impôts, c'est une politique de relance. Elle crée de l'activité, mais elle creuse le déficit. `;
  else if (impulse < -3) emp += `Globalement, votre budget a freiné l'activité : moins de dépenses ou plus d'impôts, c'est une politique de rigueur. C'est souvent le prix à payer, à court terme, pour réduire le déficit. `;
  if (changes.some((c) => ["invest", "education"].includes(c.l.id) && c.d > 0)) emp += `Vos investissements (éducation, recherche, infrastructures) préparent l'avenir : leur effet sur la croissance grandira les années suivantes. `;
  if (changes.some((c) => c.l.id === "cotpat" && c.d > 0)) emp += `La hausse des cotisations patronales rend l'embauche plus chère : les entreprises recrutent moins. `;
  if (pedago) emp += `À retenir : quand l'activité accélère, les entreprises embauchent et le chômage baisse ; quand elle ralentit, il monte (c'est la loi d'Okun).`;
  S.push({ icon: "trending-up", color: C.mint, t: "Croissance et emploi", c: emp.trim() });

  // 4. Société et opinion
  let soc = "";
  const dI = (after.inegalites ?? 45) - (before.inegalites ?? 45);
  const nomme = (c) => `${c.d > 0 ? "la hausse" : "la baisse"} de « ${shortLabel(c.l)} »`;
  const reduc = changes.filter((c) => (INEG[c.l.id] || 0) * c.d < 0), aggr = changes.filter((c) => (INEG[c.l.id] || 0) * c.d > 0);
  const iTxt = `(${fmt(before.inegalites ?? 45, 0)} → ${fmt(after.inegalites ?? 45, 0)})`;
  if (dI <= -1) soc += reduc.length
    ? `Les inégalités reculent ${iTxt} grâce à ${reduc.slice(0, 2).map(nomme).join(" et ")}${aggr.length ? `, qui compense${reduc.slice(0, 2).length > 1 ? "nt" : ""} l'effet de ${aggr.slice(0, 2).map(nomme).join(" et ")} (qui pèse surtout sur les ménages modestes)` : ""}. Redistribuer, c'est prendre davantage aux plus aisés ou donner davantage aux plus modestes. `
    : `Les inégalités reculent ${iTxt}. `;
  else if (dI >= 1) soc += aggr.length
    ? `Les inégalités augmentent ${iTxt} à cause de ${aggr.slice(0, 2).map(nomme).join(" et ")} : ces choix pèsent proportionnellement plus sur les ménages modestes. `
    : `Les inégalités augmentent ${iTxt}. `;
  const dC = after.cohesion - before.cohesion;
  if (dC <= -2) soc += `La société se tend (cohésion ${fmt(before.cohesion, 0)} → ${fmt(after.cohesion, 0)}) : les Français sentent les efforts demandés. `;
  else if (dC >= 2) soc += `La société est plus unie (cohésion ${fmt(before.cohesion, 0)} → ${fmt(after.cohesion, 0)}). `;
  const dP = after.popularite - before.popularite;
  soc += dP <= -1 ? `Votre popularité baisse (${fmt(before.popularite, 0)} → ${fmt(after.popularite, 0)}) : les hausses d'impôts et les économies sont impopulaires, même quand elles sont nécessaires.` : dP >= 1 ? `Votre popularité progresse (${fmt(before.popularite, 0)} → ${fmt(after.popularite, 0)}).` : `Votre popularité est stable (${fmt(after.popularite, 0)}).`;
  if (pedago) soc += ` Sachez aussi que le pouvoir « s'use » : la popularité baisse un peu chaque année, quoi qu'on fasse.`;
  S.push({ icon: "users-group", color: "#7FB0C9", t: "Société et opinion", c: soc });

  // 5. Conseil pour l'an prochain
  const tips = [];
  if (after.solde < -4) tips.push("Le déficit reste élevé. Pour le réduire, deux voies : augmenter des recettes ou baisser des dépenses. Cherchez celles qui pèsent le moins sur les ménages modestes et sur la croissance.");
  else if (after.solde >= -1) tips.push("Vos comptes sont sains : vous avez de la marge pour investir dans l'avenir (éducation, recherche, transition écologique).");
  if (after.chomage > before.chomage + 0.2) tips.push("Le chômage monte : évitez d'alourdir le coût du travail et pensez à l'investissement, qui crée des emplois.");
  if ((after.inegalites ?? 45) > 55) tips.push("Les inégalités sont fortes : les impôts progressifs (revenu, patrimoine) et les aides aux modestes permettent de les réduire.");
  if (after.cohesion < 40) tips.push("La société est tendue : des coupes trop brutales pourraient déclencher grèves ou émeutes.");
  if (marche != null && marche > 5.2) tips.push("Surveillez le taux de vos nouveaux emprunts : s'il continue de monter, les intérêts mangeront une part croissante de votre budget.");
  else if (after.solde < -3) tips.push("Rappelez-vous : chaque année, votre dette se refinance plus cher. Plus le déficit est réduit tôt, moins la charge d'intérêts s'envolera.");
  if (!tips.length) tips.push("Votre situation est équilibrée : gardez le cap, et restez attentif aux imprévus.");
  S.push({ icon: "bulb", color: C.gold, t: "Mon conseil pour l'an prochain", c: tips.slice(0, 2).join(" ") });

  return S;
}

/* ============================================================
   SCORING — éco 55 % / social 30 % / politique 15 %
   ============================================================ */
function scoreBreakdown(ind) {
  const sc = (v, lo, hi) => clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
  const choScore = sc(CHOM0 + 1.5 - ind.chomage, 1, 4.5); // 4,5 % = excellent, 8 % = nul
  const eco = (
    sc(ind.solde, -4, 1) * 0.30 +                  // 0 % = excellent, excédent = parfait
    sc(DETTE0 + 5 - ind.dette, 0, 18) * 0.30 + // faire reculer la dette = récompensé
    choScore * 0.20 +
    sc(ind.croissance, 0.5, 2) * 0.20
  );
  const egalite = 100 - (ind.inegalites ?? 45); // moins d'inégalités = meilleur score social
  const social = ind.cohesion * 0.4 + egalite * 0.25 + ind.environnement * 0.2 + choScore * 0.15;
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
  const detteDelta = last.dette - DETTE0;
  const p = [];
  p.push(`Sur ${YEARS} ans, votre déficit moyen a été de ${fmt(avgSolde, 1)} % du PIB`);
  p.push(detteDelta > 2 ? `la dette est passée de ${fmt(DETTE0, 0)} % à ${fmt(last.dette, 0)} % (+${fmt(detteDelta, 0)} points)` : detteDelta < -2 ? `la dette a reculé de ${fmt(DETTE0, 0)} % à ${fmt(last.dette, 0)} %` : `la dette est restée stable (${fmt(last.dette, 0)} %)`);
  p.push(last.chomage < 7 ? `le chômage a baissé à ${fmt(last.chomage, 1)} %` : last.chomage > 9 ? `le chômage a grimpé à ${fmt(last.chomage, 1)} %` : `le chômage s'établit à ${fmt(last.chomage, 1)} %`);
  if (last.integrite < 40) p.push(`et votre intégrité, entamée (${fmt(last.integrite, 0)}/100), a nourri les scandales`);
  return p.join(", ") + ".";
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

// Bilan pédagogique développé : analyse par domaine des conséquences des choix
function leconDetaillee(game) {
  const h = game.history || [];
  const last = h.length ? h[h.length - 1].ind : game.ind;
  const avgSolde = h.length ? h.reduce((s, r) => s + r.ind.solde, 0) / h.length : game.ind.solde;
  const detteDelta = last.dette - DETTE0;
  const S = [];

  // 1. Finances publiques
  let fin;
  if (detteDelta > 5)
    fin = `Votre dette publique est passée de ${fmt(DETTE0, 0)} % à ${fmt(last.dette, 0)} % du PIB. Le mécanisme est simple : chaque année où l'État dépense plus qu'il ne gagne (votre déficit moyen : ${fmt(avgSolde, 1)} % du PIB), le manque s'ajoute à la dette. Et plus la dette est élevée, plus les intérêts à rembourser sont lourds — c'est « l'effet boule de neige », qui rend le redressement de plus en plus difficile. Pour mémoire, les règles européennes (critères de Maastricht) visent un déficit sous 3 % du PIB et une dette sous 60 %.`;
  else if (detteDelta < -2)
    fin = `Vous avez fait reculer la dette, de ${fmt(DETTE0, 0)} % à ${fmt(last.dette, 0)} % du PIB — c'est rare et difficile. Cela suppose un déficit maîtrisé (le vôtre : ${fmt(avgSolde, 1)} % en moyenne) et une croissance qui « dilue » la dette dans un PIB plus grand. Règle clé : dès que le déficit passe sous ~3 % du PIB, la dette tend à se stabiliser, puis à baisser, quand l'économie croît.`;
  else
    fin = `Votre dette est restée globalement stable autour de ${fmt(last.dette, 0)} % du PIB, avec un déficit moyen de ${fmt(avgSolde, 1)} %. Stabiliser la dette sans la réduire, c'est déjà éviter l'effet boule de neige — mais la France reste nettement au-dessus des seuils européens (déficit 3 %, dette 60 %).`;
  S.push({ t: "Vos finances publiques", c: fin });

  // 2. Croissance et emploi
  let emp = last.chomage < 7 ? `Le chômage a baissé à ${fmt(last.chomage, 1)} %. ` : last.chomage > 9 ? `Le chômage a grimpé à ${fmt(last.chomage, 1)} %. ` : `Le chômage s'établit à ${fmt(last.chomage, 1)} %. `;
  emp += `Emploi et croissance vont de pair (c'est la loi d'Okun) : quand l'activité accélère, les entreprises embauchent ; quand elle ralentit, le chômage monte. Mais tous les leviers n'agissent pas de la même façon : l'investissement et l'éducation nourrissent la croissance de demain (effet d'offre), tandis qu'une forte hausse d'impôts freine la demande à court terme, et qu'alourdir les cotisations renchérit le coût du travail.`;
  S.push({ t: "Croissance et emploi", c: emp });

  // 3. Cohésion / société
  let soc = last.cohesion > 60 ? `La société est restée apaisée (cohésion ${fmt(last.cohesion, 0)}/100). Dépenses sociales, services publics et redistribution y contribuent : ils réduisent les inégalités et amortissent les crises. ` : last.cohesion < 35 ? `La cohésion sociale s'est dégradée (${fmt(last.cohesion, 0)}/100). Des coupes trop fortes dans les aides, les services publics ou les dotations aux collectivités fracturent la société et peuvent déclencher grèves et émeutes. ` : `La cohésion sociale est moyenne (${fmt(last.cohesion, 0)}/100). `;
  soc += `C'est l'arbitrage central du gouvernant : réduire la dépense assainit les comptes, mais chaque euro économisé a un coût social pour quelqu'un.`;
  S.push({ t: "Vos choix de société", c: soc });

  // 4. Éthique (conditionnel)
  if (last.integrite < 55)
    S.push({ t: "Éthique et confiance", c: `Votre intégrité a souffert (${fmt(last.integrite, 0)}/100). Céder aux lobbies ou étouffer une affaire rapporte à court terme, mais mine la confiance démocratique : la transparence protège mieux que le secret, et les scandales finissent par éclater — souvent au pire moment.` });

  // 5. Environnement (conditionnel)
  if (last.environnement > 62)
    S.push({ t: "Transition écologique", c: `Vous avez investi pour le climat (${fmt(last.environnement, 0)}/100) : un coût immédiat, mais un bénéfice de long terme — moins de dépendance énergétique et une transition engagée.` });
  else if (last.environnement < 40)
    S.push({ t: "Transition écologique", c: `L'environnement a été négligé (${fmt(last.environnement, 0)}/100) : des économies à court terme, mais une facture écologique et sanitaire reportée sur les générations suivantes.` });

  // 6. Leçon essentielle (toujours)
  S.push({ t: "Ce qu'il faut retenir", c: `Gouverner, c'est arbitrer. Un budget n'est jamais un simple tableur : toute dépense doit être financée, toute économie a un coût social, toute hausse d'impôt pèse sur l'activité. Il n'existe pas de choix parfait, seulement des équilibres à trouver. Le bon gouvernant n'est pas celui qui fait plaisir à tout le monde, mais celui qui concilie des comptes tenables, l'emploi et la cohésion du pays.` });

  return S;
}

/* ============================================================
   TROPHÉES collectionnables (gardés d'une partie à l'autre)
   ============================================================ */
const TROPHIES = [
  { id: "equilibre", label: "Équilibriste", icon: "scale", desc: "Finir avec un budget à l'équilibre ou en excédent.", check: (g) => g.ind.solde >= 0 },
  { id: "desendet", label: "Désendetteur·se", icon: "trending-down", desc: "Faire reculer la dette sous 110 % du PIB.", check: (g) => g.ind.dette < 110 },
  { id: "pleinemploi", label: "Plein emploi", icon: "briefcase", desc: "Ramener le chômage sous 6 %.", check: (g) => g.ind.chomage < 6 },
  { id: "mainspropres", label: "Mains propres", icon: "shield-check", desc: "Garder une intégrité d'au moins 90.", check: (g) => g.ind.integrite >= 90 },
  { id: "vert", label: "Président·e vert·e", icon: "leaf", desc: "Atteindre 70 en environnement.", check: (g) => g.ind.environnement >= 70 },
  { id: "rassembleur", label: "Rassembleur·se", icon: "users-group", desc: "Maintenir une cohésion d'au moins 75.", check: (g) => g.ind.cohesion >= 75 },
  { id: "justice", label: "Justice sociale", icon: "stairs", desc: "Réduire les inégalités sous 35.", check: (g) => (g.ind.inegalites ?? 45) < 35 },
  { id: "croissance", label: "Moteur de croissance", icon: "rocket", desc: "Finir avec une croissance supérieure à 2 %.", check: (g) => g.ind.croissance > 2 },
  { id: "triomphe", label: "Plébiscité·e", icon: "crown", desc: "Être réélu·e triomphalement.", check: (g, sc, end) => end && end.key === "triomphe" },
  { id: "sansfaute", label: "Sans-faute", icon: "star", desc: "Obtenir un score d'au moins 75.", check: (g, sc) => sc && sc.total >= 75 },
];
const trophiesWon = (game, sc, end) => TROPHIES.filter((t) => { try { return t.check(game, sc, end); } catch { return false; } });
const TROPHY_KEY = "quinq:trophies";

/* ============================================================
   UI
   ============================================================ */
// Palette référencée par variables CSS -> permet de basculer dark/clair instantanément.
const C = {
  bg: "var(--bg)", card: "var(--card)", card2: "var(--card2)", line: "var(--line)",
  gold: "var(--gold)", mint: "var(--mint)", coral: "var(--coral)",
  ink: "var(--ink)", sub: "var(--sub)", dim: "var(--dim)",
  inset: "var(--inset)", onAccent: "var(--on-accent)", track: "var(--track)",
  coralBg: "var(--coral-bg)", amberBg: "var(--amber-bg)",
};
const Icon = ({ n, size = 18, color, style }) => (
  <i className={"ti ti-" + n} style={{ fontSize: size, color, lineHeight: 1, ...style }} aria-hidden="true" />
);

// Métadonnées d'affichage des indicateurs
const IND_META = [
  { id: "solde", label: "Solde", icon: "ti-wallet", unit: "%", fmt: (v) => (v > 0 ? "+" : "") + fmt(v, 1), good: (v) => v > -3, bad: (v) => v < -6, grp: "Économie",
    info: "Différence entre ce que l'État encaisse (recettes) et ce qu'il dépense, en % du PIB. Négatif = déficit : il dépense plus qu'il ne gagne. Objectif : se rapprocher de 0, voire d'un excédent." },
  { id: "dette", label: "Dette", icon: "ti-chart-line", unit: "%", fmt: (v) => fmt(v, 0), good: (v) => v < 110, bad: (v) => v > 130, grp: "Économie",
    info: "Total de tous les déficits passés, exprimé en % du PIB. Plus elle est élevée, plus les intérêts à rembourser sont lourds (effet boule de neige). La règle européenne vise 60 %." },
  { id: "chomage", label: "Chômage", icon: "ti-briefcase", unit: "%", fmt: (v) => fmt(v, 1), good: (v) => v < 7, bad: (v) => v > 9, grp: "Économie",
    info: "Part de la population active sans emploi. Il baisse quand l'économie crée des emplois (croissance) et monte quand elle ralentit : c'est la loi d'Okun." },
  { id: "croissance", label: "Croissance", icon: "ti-trending-up", unit: "%", fmt: (v) => (v > 0 ? "+" : "") + fmt(v, 1), good: (v) => v > 1.3, bad: (v) => v < 0.3, grp: "Économie",
    info: "Évolution du PIB, la richesse produite dans le pays. Forte, elle crée des emplois et des recettes ; faible ou négative, c'est la récession." },
  { id: "inflation", label: "Inflation", icon: "ti-flame", unit: "%", fmt: (v) => fmt(v, 1), good: (v) => v < 3, bad: (v) => v > 6, grp: "Économie", inv: true,
    info: "Hausse générale des prix sur un an. Trop forte, elle grignote le pouvoir d'achat et fait monter les taux d'intérêt ; c'était le grand problème des années 1970-80. Elle accélère quand l'économie surchauffe." },
  { id: "cohesion", label: "Cohésion", icon: "ti-users-group", unit: "", fmt: (v) => fmt(v, 0), good: (v) => v > 60, bad: (v) => v < 35, grp: "Société",
    info: "Mesure l'unité et la paix sociale du pays. Renforcée par les services publics et la redistribution ; fragilisée par les coupes budgétaires et les inégalités. Trop basse, elle mène aux émeutes." },
  { id: "inegalites", label: "Inégalités", icon: "ti-stairs", unit: "", fmt: (v) => fmt(v, 0), good: (v) => v < 38, bad: (v) => v > 55, grp: "Société", inv: true,
    info: "Écart entre les plus riches et les plus modestes. Réduites par l'impôt progressif (sur le revenu, le patrimoine) et les aides ; aggravées par les impôts régressifs (TVA) et les coupes sociales. Plus c'est bas, mieux c'est." },
  { id: "environnement", label: "Environnement", icon: "ti-leaf", unit: "", fmt: (v) => fmt(v, 0), good: (v) => v > 60, bad: (v) => v < 35, grp: "Société",
    info: "État de la transition écologique. Progresse avec l'investissement vert et la fiscalité carbone ; se dégrade peu à peu si on l'ignore." },
  { id: "popularite", label: "Popularité", icon: "ti-mood-smile", unit: "", fmt: (v) => fmt(v, 0), good: (v) => v > 55, bad: (v) => v < 35, grp: "Politique",
    info: "Soutien de l'opinion publique. Décisive le jour de l'élection. Elle s'use naturellement avec le temps (« usure du pouvoir »)." },
  { id: "integrite", label: "Intégrité", icon: "ti-scale", unit: "", fmt: (v) => fmt(v, 0), good: (v) => v > 70, bad: (v) => v < 40, grp: "Politique",
    info: "Probité de votre gouvernement. Entamée par les compromissions (accepter un lobby, étouffer une affaire). Une intégrité trop basse finit par déclencher des scandales." },
];
const indColor = (m, v) => (m.bad(v) ? C.coral : m.good(v) ? C.mint : C.gold);
// Groupes d'indicateurs, affichés séparément dans le tableau de bord
const IND_GROUPS = [
  { key: "Économie", label: "Économie", icon: "coin", color: C.gold },
  { key: "Société", label: "Société & environnement", icon: "heart-handshake", color: C.mint },
  { key: "Politique", label: "Vie politique", icon: "speakerphone", color: "#B57BA6" },
];
function IndicatorChip({ m, ind, prev, open, onToggle }) {
  const v = ind[m.id]; const col = indColor(m, v);
  const d = prev ? v - prev[m.id] : 0;
  const dShow = prev && Math.abs(d) >= 0.05;
  const improved = prev && (m.inv ? -d : d) >= 1;
  return (
    <button onClick={onToggle} title="En savoir plus" className={improved ? "qwin" : ""}
      style={{ textAlign: "left", cursor: "pointer", flex: "1 1 92px", minWidth: 84, maxWidth: 180, background: C.card, borderRadius: 10, padding: "8px 9px", border: `1px solid ${open ? C.gold : improved ? C.mint : C.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, color: C.dim, fontSize: 10.5, marginBottom: 3 }}>
        <Icon n={m.icon.replace("ti-", "")} size={13} /> {m.label}
        <Icon n="help-circle" size={11} color={open ? C.gold : C.dim} style={{ marginLeft: "auto" }} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ color: col, fontFamily: "monospace", fontSize: 17, fontWeight: 600 }}>{m.fmt(v)}<span style={{ fontSize: 10, color: C.dim }}>{m.unit}</span></span>
        {dShow && <span style={{ fontSize: 10, fontFamily: "monospace", color: (m.inv ? -d : d) > 0 ? C.mint : C.coral }}>{d > 0 ? "▲" : "▼"}{fmt(Math.abs(d), 1)}</span>}
      </div>
    </button>
  );
}
function HUD({ ind, prev }) {
  const [openInd, setOpenInd] = useState(null);
  const openMeta = IND_META.find((m) => m.id === openInd);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {IND_GROUPS.map((g) => (
        <div key={g.key}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: g.color, fontWeight: 600, marginBottom: 5 }}>
            <Icon n={g.icon} size={12} /> {g.label}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {IND_META.filter((m) => m.grp === g.key).map((m) => (
              <IndicatorChip key={m.id} m={m} ind={ind} prev={prev} open={openInd === m.id} onToggle={() => setOpenInd(openInd === m.id ? null : m.id)} />
            ))}
          </div>
          {openMeta && openMeta.grp === g.key && (
            <div style={{ marginTop: 6, background: C.inset, border: `1px solid ${C.gold}55`, borderRadius: 9, padding: "9px 12px", fontSize: 12.5, color: C.sub, lineHeight: 1.55 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.gold, fontWeight: 600, marginBottom: 3 }}><Icon n="bulb" size={13} /> {openMeta.label}</span>
              {openMeta.info}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Compteur animé : le nombre défile de 0 jusqu'à la valeur finale
function CountUp({ to, dur = 1100 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, t0;
    const tick = (t) => { if (!t0) t0 = t; const p = Math.min(1, (t - t0) / dur); setV(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [to, dur]);
  return <>{v}</>;
}
// Pluie de confettis (sur la réélection triomphale)
function Confetti() {
  const cols = ["#F4C64A", "#8FD1B0", "#C97B7B", "#6F94C9", "#B57BA6", C.ink];
  const bits = Array.from({ length: 70 });
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 50 }} aria-hidden="true">
      {bits.map((_, i) => {
        const left = Math.random() * 100, delay = Math.random() * 0.8, dur = 2.4 + Math.random() * 1.8, size = 6 + Math.random() * 7;
        const col = cols[i % cols.length];
        return <span key={i} style={{ position: "absolute", top: "-16px", left: left + "%", width: size, height: size * 0.5, background: col, borderRadius: 2, opacity: 0.9, animation: `qfall ${dur}s linear ${delay}s forwards` }} />;
      })}
    </div>
  );
}
function Btn({ onClick, children, kind = "ghost", disabled, style }) {
  const base = { border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 16px", fontSize: 14, cursor: disabled ? "default" : "pointer", fontWeight: 500, transition: "all .15s", opacity: disabled ? 0.5 : 1 };
  const kinds = {
    primary: { background: C.gold, color: C.onAccent, border: "1px solid " + C.gold },
    mint: { background: C.mint, color: C.onAccent, border: "1px solid " + C.mint },
    ghost: { background: "transparent", color: C.ink },
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...kinds[kind], ...style }}>{children}</button>;
}

function HistContext({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: C.inset, border: `1px solid ${C.gold}55`, borderRadius: 10, padding: "9px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, color: C.gold, fontSize: 12.5, fontWeight: 600 }}>
        <Icon n="history" size={15} /> Le contexte historique {open ? "▲" : "▼"}
      </button>
      {open && <div style={{ marginTop: 6, fontSize: 13, color: C.sub, lineHeight: 1.6, background: C.inset, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px" }}>{text}</div>}
    </div>
  );
}
function Note({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 6 }}>
      <button onClick={() => setOpen(!open)} style={{ background: "transparent", border: "none", color: C.gold, fontSize: 11.5, cursor: "pointer", padding: "10px 0", margin: "-10px 0", minHeight: 40, touchAction: "manipulation", display: "flex", alignItems: "center", gap: 4 }}>
        <Icon n="bulb" size={13} /> Le saviez-vous ? {open ? "▲" : "▼"}
      </button>
      {open && <div style={{ marginTop: 5, fontSize: 12, color: C.sub, lineHeight: 1.55, background: C.inset, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px" }}>{text}</div>}
    </div>
  );
}

/* ---------- Écran d'accueil ---------- */
function Home({ onPickEra, onResume, onLeaderboard, onTrophies, hasSave }) {
  return (
    <div>
      {/* HÉROS : nuit au palais (texte au-dessus du palais, sans chevauchement) */}
      <div style={{ position: "relative", height: 380, borderRadius: 18, overflow: "hidden", background: "linear-gradient(180deg,#0b1430 0%,#16244a 55%,#0a0f1f 100%)" }}>
        <svg viewBox="0 0 1000 380" preserveAspectRatio="xMidYMax slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden="true">
          <g fill="#fff" opacity=".5"><circle cx="80" cy="40" r="1.2" /><circle cx="210" cy="190" r="1" /><circle cx="140" cy="120" r="1.4" /><circle cx="860" cy="60" r="1.1" /><circle cx="900" cy="170" r="1.3" /><circle cx="940" cy="35" r="1" /><circle cx="790" cy="140" r=".9" /></g>
          <g transform="translate(0,60)">
            <rect x="250" y="230" width="500" height="110" fill="#050912" />
            <polygon points="400,230 600,230 500,200" fill="#050912" />
            <g fill="#f4c64a" className="qwinglow"><rect x="300" y="250" width="22" height="30" /><rect x="678" y="250" width="22" height="30" /><rect x="482" y="256" width="36" height="84" /></g>
            <g fill="#f4c64a" opacity=".3"><rect x="350" y="250" width="22" height="30" /><rect x="628" y="250" width="22" height="30" /><rect x="400" y="296" width="22" height="30" /><rect x="578" y="296" width="22" height="30" /></g>
            <line x1="500" y1="200" x2="500" y2="172" stroke="#050912" strokeWidth="3" />
            <rect x="502" y="172" width="10" height="13" fill="#2a4fa0" /><rect x="512" y="172" width="10" height="13" fill="#ddd" /><rect x="522" y="172" width="10" height="13" fill="#c8102e" />
          </g>
          <ellipse cx="500" cy="385" rx="420" ry="40" fill="#f4c64a" opacity=".07" />
        </svg>
        <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 120px #000" }} />
        <div style={{ position: "absolute", top: 30, width: "100%", textAlign: "center", textShadow: "0 2px 14px rgba(0,0,0,.6)" }}>
          <div style={{ fontSize: 38, letterSpacing: ".38em", paddingLeft: ".38em", color: "#fff", fontWeight: 300 }}>QUINQUENNAT</div>
          <div style={{ width: 54, height: 1, background: "#f4c64a", margin: "12px auto" }} />
          <div style={{ fontSize: 15, color: "#cfd6e6" }}>Une lumière reste allumée. C'est la vôtre.</div>
          <div style={{ fontSize: 14, color: "#f4c64a", marginTop: 8, fontFamily: "Fraunces,serif", fontStyle: "italic" }}>Auriez-vous fait mieux qu'eux ?</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, margin: "26px 0 12px" }}>
        <span style={{ color: C.ink, fontSize: 20, fontWeight: 600, fontFamily: "Fraunces,serif" }}>Choisissez votre époque</span>
        <span style={{ color: C.dim, fontSize: 12.5 }}>Prenez la place d'un président, avec la situation et les crises réelles de son mandat.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
        {ERAS.map((e) => (
          <button key={e.id} onClick={() => onPickEra(e.id)} className="qposter" style={{ position: "relative", textAlign: "left", cursor: "pointer", height: 172, borderRadius: 12, overflow: "hidden", padding: 12, display: "flex", flexDirection: "column", justifyContent: "flex-end", background: `linear-gradient(180deg, ${e.couleurs[0]} 0%, ${e.couleurs[1]} 100%)`, border: e.id === "today" ? "2px solid #f4c64a" : "2px solid transparent" }}>
            <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 50px rgba(0,0,0,.55)" }} />
            <div style={{ position: "absolute", top: 9, left: 10, fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.75)" }}>{e.duree === 7 ? "Septennat" : "Quinquennat"}</div>
            <div style={{ position: "relative", fontFamily: "Fraunces,Georgia,serif", fontSize: e.id === "today" ? 21 : 28, fontWeight: 600, lineHeight: 1.05, color: e.id === "today" ? "#f4c64a" : "#fff" }}>{e.id === "today" ? "Aujourd'hui" : e.debut}</div>
            <div style={{ position: "relative", fontSize: 11.5, color: "#fff", marginTop: 4, fontWeight: 500 }}>{e.id === "today" ? `${e.debut}-${e.debut + e.duree}` : e.president}</div>
            <div style={{ position: "relative", fontSize: 10.5, color: "rgba(255,255,255,.8)", marginTop: 3, lineHeight: 1.3 }}>{e.tagline}</div>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
        {hasSave && <Btn onClick={onResume}><Icon n="refresh" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Reprendre ma partie</Btn>}
        <Btn onClick={() => onLeaderboard("CLASSE")}><Icon n="list-numbers" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Classement</Btn>
        <Btn onClick={onTrophies}><Icon n="trophy" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Trophées</Btn>
      </div>
    </div>
  );
}

/* ---------- Page d'une époque : rappel historique, situation de départ, préparation ---------- */
function EraSetup({ eraId, onStart, onSkipConseil, onBack }) {
  const [code, setCode] = useState("CLASSE");
  const [team, setTeam] = useState("");
  const [doc, setDoc] = useState(null);
  const e = eraById(eraId), info = ERA_INFO[e.id] || {};
  const codeOk = (code.trim() || "CLASSE");
  const canStart = team.trim() && doc;
  const step = (n, label, done) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "24px 0 10px" }}>
      <span style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: done ? C.gold : "transparent", color: done ? C.onAccent : C.gold, border: `1.5px solid ${C.gold}` }}>{done ? "✓" : n}</span>
      <span style={{ color: C.ink, fontSize: 16, fontWeight: 600, fontFamily: "Fraunces,serif" }}>{label}</span>
    </div>
  );
  const chip = (label, val) => (
    <div style={{ background: "rgba(0,0,0,.35)", borderRadius: 10, padding: "8px 12px", minWidth: 110 }}>
      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.7)", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div style={{ fontSize: 18, color: "#fff", fontWeight: 600, fontFamily: "monospace" }}>{val}</div>
    </div>
  );
  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 12 }}>← Changer d'époque</button>
      {/* Bandeau d'époque */}
      <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", padding: "22px 22px 18px", background: `linear-gradient(135deg, ${e.couleurs[0]} 0%, ${e.couleurs[1]} 100%)` }}>
        <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 80px rgba(0,0,0,.5)" }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.75)" }}>{e.duree === 7 ? "Septennat" : "Quinquennat"} · {e.debut}-{e.debut + e.duree}</div>
          <div style={{ fontFamily: "Fraunces,Georgia,serif", fontSize: 30, fontWeight: 600, color: "#fff", margin: "4px 0 2px" }}>{e.id === "today" ? "Aujourd'hui : à vous de jouer" : `À la place de ${e.president}`}</div>
          <div style={{ fontSize: 14, color: "#f4c64a", fontStyle: "italic", marginBottom: 14 }}>{e.tagline}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {chip("Dette", `${fmt(e.dette, 0)} %`)}{chip("Déficit", `${fmt(e.solde, 1)} %`)}{chip("Chômage", `${fmt(e.chomage, 1)} %`)}{chip("Inflation", `${fmt(e.inflation, 1)} %`)}{chip("Taux d'emprunt", `${fmt(e.marche, 1)} %`)}
          </div>
        </div>
      </div>
      {/* Rappel historique */}
      <div style={{ marginTop: 14, background: C.card2, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.gold, fontSize: 14, fontWeight: 600, marginBottom: 6 }}><Icon n="history" size={17} /> Ce qui s'est passé avant {e.debut}</div>
        <p style={{ margin: 0, color: C.sub, fontSize: 14, lineHeight: 1.65 }}>{info.rappel}</p>
        {e.id !== "today" && <p style={{ margin: "10px 0 0", color: C.dim, fontSize: 12.5, lineHeight: 1.5 }}>Pendant votre mandat, vous affronterez les grands événements réels de l'époque. À la fin, vous découvrirez ce qu'a fait le vrai président et comparerez vos résultats aux siens. Les montants sont convertis en euros.</p>}
      </div>

      {step(1, "Nommez votre équipe", !!team.trim())}
      <input value={team} onChange={(ev) => setTeam(ev.target.value)} placeholder="Les Réformateurs" style={{ ...inp, fontSize: 15, maxWidth: 420 }} autoFocus />

      {step(2, "Choisissez votre doctrine", !!doc)}
      <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 8 }}>Une simple orientation : vous restez libre de tous vos choix ensuite.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
        {DOCTRINES.map((d) => (
          <div key={d.id} onClick={() => setDoc(d.id)} style={{ cursor: "pointer", background: C.card, border: `2px solid ${doc === d.id ? d.color : C.line}`, borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Icon n={d.icon.replace("ti-", "")} size={20} color={d.color} />
              <span style={{ color: C.ink, fontWeight: 500, fontSize: 14 }}>{d.label}</span>
            </div>
            <div style={{ color: d.color, fontSize: 11, marginBottom: 4 }}>{d.ref}</div>
            <div style={{ color: C.sub, fontSize: 12, lineHeight: 1.5 }}>{d.desc}</div>
          </div>
        ))}
      </div>

      <label style={{ fontSize: 12, color: C.dim, display: "block", margin: "22px 0 18px" }}>Classe <span style={{ fontWeight: 400 }}>(facultatif)</span>
        <input value={code} onChange={(ev) => setCode(ev.target.value.toUpperCase())} placeholder="CLASSE" style={{ ...inp, maxWidth: 240 }} />
        <span style={{ fontSize: 10.5, color: C.dim }}>Regroupe les scores dans le classement. Les équipes qui ont le même nom de classe et la même époque affrontent les mêmes imprévus. Déjà rempli — à modifier uniquement si votre professeur vous donne un nom précis.</span>
      </label>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Btn kind="primary" disabled={!canStart} onClick={() => onStart(codeOk.toUpperCase(), team.trim(), doc, e.id)} style={{ fontSize: 15, padding: "12px 20px" }}>
          <Icon n="player-play" size={16} style={{ verticalAlign: -3, marginRight: 7 }} />Entrer au palais (avec année conseil)
        </Btn>
        {canStart && <Btn onClick={() => onSkipConseil(codeOk.toUpperCase(), team.trim(), doc, e.id)}><Icon n="player-skip-forward" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Passer l'année conseil</Btn>}
      </div>
      {!canStart && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.gold, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon n="info-circle" size={14} />Avant de commencer, complétez : {[!team.trim() && "le nom d'équipe", !doc && "la doctrine"].filter(Boolean).join(" et ")}.
        </div>
      )}
    </div>
  );
}
const inp = { display: "block", width: "100%", marginTop: 4, boxSizing: "border-box", background: C.inset, border: "1px solid #2C4372", borderRadius: 8, color: C.ink, padding: "9px 11px", fontSize: 14 };

/* ---------- Écran Mission (objectif clair avant de jouer) ---------- */
/* ---------- Année conseil : intro (le président sortant demande conseil) ---------- */
function ConseilIntro({ team, onGo }) {
  const info = ERA_INFO[CURRENT_ERA.id] || {};
  return (
    <div>
      <ScreenTitle icon="user-star" title="Avant de gouverner… un conseil" sub="Une mise en bouche qui ne compte pas" />
      <div style={{ background: C.card2, border: `1px solid ${C.line}`, borderRadius: 16, padding: 22, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="building-bank" size={24} color={C.onAccent} /></div>
          <p style={{ color: C.sub, fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>
            Nous sommes en <b style={{ color: C.ink }}>{CURRENT_ERA.debut}</b>. <b style={{ color: C.ink }}>{info.pred}</b> {info.predSituation}. Avant l'élection, il faut encore voter un <b style={{ color: C.ink }}>dernier budget</b>, et l'équipe au pouvoir cherche un regard neuf. Votre réputation est arrivée jusqu'au palais : on vous demande, <b style={{ color: C.gold }}>{team}</b>, de proposer ce budget à partir de quelques leviers clés. Rien ne vous engage : c'est un entraînement avant votre propre campagne.
          </p>
        </div>
      </div>
      <div style={{ color: C.dim, fontSize: 13, marginBottom: 16, lineHeight: 1.55 }}>
        Vous allez découvrir le fonctionnement du budget avec <b style={{ color: C.sub }}>quelques leviers simples</b>, puis affronter <b style={{ color: C.sub }}>2 imprévus</b>. Ensuite, vous vous présenterez à l'élection pour votre vrai mandat de {YEARS} ans.
      </div>
      <Btn kind="primary" onClick={onGo} style={{ fontSize: 15, padding: "12px 20px" }}><Icon n="arrow-right" size={16} style={{ verticalAlign: -3, marginRight: 7 }} />Découvrir le budget</Btn>
    </div>
  );
}

/* ---------- Année conseil : bilan + présentation à l'élection ---------- */
function ConseilBilan({ indBefore, ind, onElection }) {
  let verdict, tone;
  if (ind.solde > indBefore.solde + 0.3) { verdict = "Vous avez le sens de l'équilibre : le déficit s'est réduit. L'équipe sortante est convaincue que vous avez l'étoffe d'un·e président·e."; tone = C.mint; }
  else if (ind.solde < indBefore.solde - 0.5) { verdict = "Le déficit s'est creusé… Gouverner n'est pas si simple ! Heureusement, cette année ne comptait pas : vous savez maintenant ce qui vous attend."; tone = C.coral; }
  else { verdict = "Un budget prudent, sans grand bouleversement. Vous avez saisi le principe : chaque choix a un coût."; tone = C.gold; }
  return (
    <div>
      <ScreenTitle icon="clipboard-check" title="Bilan de votre conseil" sub="Ce que votre budget aurait donné" />
      <HUD ind={ind} prev={indBefore} />
      <div style={{ marginTop: 14, background: C.card2, border: `1px solid ${tone}55`, borderRadius: 14, padding: 16, display: "flex", gap: 11, alignItems: "flex-start" }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="clipboard-check" size={19} color={C.onAccent} /></div>
        <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.6 }}><b style={{ color: C.ink }}>Verdict :</b> {verdict} Il est temps de vous lancer dans la campagne.</div>
      </div>
      <div style={{ marginTop: 16 }}>
        <Btn kind="primary" onClick={onElection} style={{ fontSize: 15, padding: "12px 20px" }}><Icon n="flag" size={16} style={{ verticalAlign: -3, marginRight: 7 }} />Me présenter à l'élection</Btn>
      </div>
    </div>
  );
}

/* ---------- Transition : l'élection (vous êtes élu·e) ---------- */
function ElectionIntro({ team, onElected }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => { const t = setTimeout(() => setPhase(1), 1600); return () => clearTimeout(t); }, []);
  const amb = AMBIANCE[CURRENT_ERA.id];
  const [variant] = useState(() => amb ? Math.floor(Math.random() * amb.variants.length) : 0);
  const lignes = amb ? amb.variants[variant] : [];
  return (
    <div style={{ textAlign: "center", padding: "30px 12px" }}>
      {phase === 1 && <Confetti />}
      <Icon n="ballpen" size={46} color={C.gold} />
      <h2 style={{ color: C.ink, fontFamily: "Fraunces,serif", fontSize: 28, margin: "14px 0 8px" }}>{phase === 0 ? "Jour de l'élection…" : "Élu·e !"}</h2>
      <p style={{ color: C.dim, fontSize: 15, maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
        {phase === 0 ? "Les Français votent pour choisir leur nouveau président…" : `Félicitations, ${team} ! Le pays vous confie les clés pour ${YEARS} ans.`}
      </p>
      {phase === 1 && amb && (
        <div style={{ textAlign: "left", maxWidth: 640, margin: "22px auto 0", background: C.card2, border: `1px solid ${C.gold}55`, borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontFamily: "Fraunces,serif", fontSize: 20, color: C.gold, fontWeight: 600, marginBottom: 10 }}>{amb.date}</div>
          {lignes.map((l, i) => <p key={i} style={{ margin: "0 0 7px", color: C.sub, fontSize: 14, lineHeight: 1.6 }}>{l}</p>)}
        </div>
      )}
      {phase === 1 && <div style={{ marginTop: 22 }}><Btn kind="primary" onClick={onElected} style={{ fontSize: 15, padding: "12px 22px" }}>Commencer mon mandat <Icon n="arrow-right" size={16} style={{ verticalAlign: -3 }} /></Btn></div>}
    </div>
  );
}

function Mission({ team, doctrine, onGo }) {
  const [infoChiffres, setInfoChiffres] = useState(false);
  return (
    <div>
      <ScreenTitle icon="target-arrow" title="Votre mission" sub={`${team} · doctrine ${doctrine?.label}`} />
      <div style={{ background: C.card2, border: `1px solid ${C.line}`, borderRadius: 16, padding: 22, marginBottom: 18 }}>
        <p style={{ color: C.ink, fontSize: 16, lineHeight: 1.65, margin: 0 }}>
          Vous dirigez la France pendant <b>{YEARS} ans</b>{CURRENT_ERA.id !== "today" && <>, à partir de {CURRENT_ERA.debut}, à la place de {CURRENT_ERA.president}</>}. Chaque année : vous votez un <b>budget</b> (ce que l'État gagne et dépense), puis vous affrontez <b>3 événements</b> imprévus. À la fin, les Français votent.
        </p>
        <p style={{ color: C.sub, fontSize: 15, lineHeight: 1.65, margin: "12px 0 0" }}>
          Au départ : un <b style={{ color: C.coral }}>déficit de {fmt(-START.solde, 1)} %</b> (l'État dépense plus qu'il ne gagne) et une <b style={{ color: C.coral }}>dette de {fmt(START.dette, 0)} %</b> du PIB{CURRENT_ERA.id !== "today" && <> ; l'inflation atteint <b style={{ color: C.coral }}>{fmt(START.inflation, 1)} %</b> et l'État emprunte à <b>{fmt(MARCHE0, 1)} %</b></>}. Votre but : redresser les comptes <b>sans casser la société</b>. Attention, tout se tient — aucune décision n'est gratuite.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.gold, fontSize: 14, fontWeight: 500, marginBottom: 10 }}><Icon n="target" size={18} /> Vos objectifs</div>
          {OBJECTIFS.filter((o) => !o.show || o.show()).map((o) => (
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
      {/* Accordéon : explication du périmètre et des chiffres */}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, marginBottom: 18, overflow: "hidden" }}>
        <button onClick={() => setInfoChiffres(!infoChiffres)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", color: C.ink, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, padding: "13px 16px" }}>
          <Icon n="info-circle" size={17} color={C.gold} /> En savoir plus sur les chiffres utilisés
          <span style={{ marginLeft: "auto", color: C.dim }}>{infoChiffres ? "▲" : "▼"}</span>
        </button>
        {infoChiffres && (
          <div style={{ padding: "0 16px 16px", color: C.sub, fontSize: 13.5, lineHeight: 1.65 }}>
            <p style={{ margin: "0 0 10px" }}>
              Le jeu simule <b style={{ color: C.ink }}>les dépenses publiques de la France</b> — l'ensemble des administrations publiques : l'<b>État</b>, la <b>Sécurité sociale</b> (retraites, santé, chômage) et les <b>collectivités locales</b>. Ce n'est donc pas seulement « le budget de l'État » au sens strict : c'est le périmètre utilisé quand on parle du <b>déficit public</b> (~5 % du PIB) et de la <b>dette</b> (~116 %). Les dépenses <b>privées</b> des ménages et des entreprises n'y figurent pas.
            </p>
            <p style={{ margin: "0 0 10px" }}>
              Les chiffres de départ sont des <b style={{ color: C.ink }}>ordres de grandeur arrondis</b>, issus de sources publiques (INSEE, projet de loi de finances, Cour des comptes).
              {CURRENT_ERA.id !== "today" && <><br /><b style={{ color: C.gold }}>Votre époque ({CURRENT_ERA.debut}) :</b> dette {fmt(CURRENT_ERA.dette, 0)} % du PIB, déficit {fmt(CURRENT_ERA.solde, 1)} %, chômage {fmt(CURRENT_ERA.chomage, 1)} %, inflation {fmt(CURRENT_ERA.inflation, 1)} %, taux d'emprunt {fmt(CURRENT_ERA.marche, 1)} %. Les montants sont convertis en euros de l'époque (PIB ≈ {fmt(CURRENT_ERA.pib, 0)} milliards d'euros). Les repères ci-dessous sont ceux de la France d'aujourd'hui, pour comparaison.</>}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 18px", fontSize: 13, fontFamily: "monospace", color: C.dim, background: C.inset, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
              <div>PIB ≈ 3 000 Md€</div><div>Dette ≈ 116 % du PIB</div>
              <div>Recettes ≈ 1 450 Md€</div><div>Déficit ≈ 5 % du PIB</div>
              <div>Dépenses ≈ 1 600 Md€</div><div>Chômage ≈ 7,5 %</div>
              <div>Nouveaux emprunts ≈ 4,7 % (OAT 10 ans, oct. 2026)</div><div>Taux moyen de la dette ≈ 1,8 %</div>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              <div><b style={{ color: C.mint }}>Recettes</b> : TVA ~211 · impôt sur le revenu ~95 · CSG ~130 · impôt sur les sociétés ~58 · cotisations ~610 Md€</div>
              <div style={{ marginTop: 4 }}><b style={{ color: C.coral }}>Dépenses</b> : retraites ~340 · santé ~300 · éducation ~155 (État + collectivités) · défense ~50 Md€</div>
            </div>
            <p style={{ margin: "10px 0 0", color: C.dim, fontSize: 12.5 }}>Ces chiffres rendent le jeu crédible ; ce n'est pas une prévision officielle.</p>
          </div>
        )}
      </div>

      <Btn kind="primary" onClick={onGo} style={{ fontSize: 16, padding: "13px 22px" }}><Icon n="player-play" size={17} style={{ verticalAlign: -3, marginRight: 7 }} />Entrer en fonction</Btn>
    </div>
  );
}

/* ---------- Barre d'objectifs permanente ---------- */
function ObjBar({ ind }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
      {OBJECTIFS.filter((o) => !o.show || o.show()).map((o) => {
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
// Bandeau "marchés financiers" : taux d'emprunt + charge de la dette
function MarketStrip({ taux, marche = MARCHE0, dette }) {
  const chargeMd = Math.round(taux * dette / 100 * PIB * ECH / 100);
  const tcol = marche > 5.5 ? C.coral : marche > 4.3 ? C.gold : C.mint;
  return (
    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: C.card, border: `1px solid ${tcol}44`, borderRadius: 10, padding: "7px 12px" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.dim, fontSize: 11.5, fontWeight: 500 }}><Icon n="building-bank" size={14} color={tcol} /> Marchés financiers</span>
      <span style={{ fontSize: 12, color: C.sub }} title="Taux auquel l'État emprunte aujourd'hui (OAT 10 ans)">Nouveaux emprunts <b style={{ color: tcol, fontFamily: "monospace" }}>{fmt(marche, 1)} %</b></span>
      <span style={{ color: C.line }}>·</span>
      <span style={{ fontSize: 12, color: C.sub }} title="Taux moyen payé sur toute la dette (vieux emprunts compris)">Taux moyen de la dette <b style={{ color: C.ink, fontFamily: "monospace" }}>{fmt(taux, 2)} %</b></span>
      <span style={{ color: C.line }}>·</span>
      <span style={{ fontSize: 12, color: C.sub }}>Charge de la dette <b style={{ color: tcol, fontFamily: "monospace" }}>{fmt(chargeMd)} Md€/an</b></span>
    </div>
  );
}

/* ---------- Écran Budget (16 leviers, onglets Recettes/Dépenses) ---------- */
function BudgetScreen({ year, indPrev, baseLevels, levels, setLevels, doctrine, taux = TAUX0, marche = MARCHE0, onValidate, leverFilter = null, conseil = false }) {
  const inFilter = (l) => (!leverFilter || leverFilter.includes(l.id)) && !DISABLED.includes(l.id);
  const [tab, setTabState] = useState("rec");
  const [visited, setVisited] = useState({ rec: true, dep: false }); // "rec" affiché par défaut
  const [confirm, setConfirm] = useState(false);
  const setTab = (id) => { setTabState(id); setVisited((v) => ({ ...v, [id]: true })); setConfirm(false); };
  const nonVus = [["rec", "Recettes"], ["dep", "Dépenses"]].filter(([id]) => !visited[id]);
  const preview = useMemo(() => applyBudgetYear(indPrev, levels, baseLevels, year, doctrine), [indPrev, levels, baseLevels, year, doctrine]);
  const balance = preview.balanceMd;
  const setLevel = (id, v) => { const lv = LEVERS.find((l) => l.id === id); setLevels({ ...levels, [id]: clamp(v, lv?.lmin ?? LEVEL_MIN, LEVEL_MAX) }); };
  const list = LEVERS.filter((l) => l.cat === tab && inFilter(l));
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [tab]); // on replie à nouveau en changeant d'onglet
  const collapse = isMobile && !conseil && list.length > 4 && !expanded;
  const visibleList = collapse ? list.slice(0, 4) : list;
  const handleValider = () => { if (nonVus.length && !confirm) { setConfirm(true); } else { onValidate(); } };
  // Charge de la dette (intérêts) = taux × dette, et solde TOTAL = primaire − charge
  const marcheNext = computeMarche(marche, indPrev.dette, preview.ind.solde, indPrev.inflation);
  const tauxPrev = computeMoyen(taux, marcheNext, indPrev.dette, preview.ind.solde);
  const chargePct = tauxPrev * indPrev.dette / 100;
  const chargeMd = Math.round(chargePct * PIB * ECH / 100);
  const soldePrimaire = preview.ind.solde;
  const soldeTotal = soldePrimaire - chargePct;
  // Projection : si on garde ce solde total jusqu'en 2031, où finit la dette ?
  const detteProjetee = useMemo(() => {
    let d = indPrev.dette; const g = (preview.ind.croissance + (indPrev.inflation ?? INFL_TREND)) / 100;
    for (let i = year; i <= YEARS; i++) d = d + (-soldeTotal) - d * g;
    return d;
  }, [indPrev.dette, soldeTotal, preview.ind.croissance, year]);
  const detteMonte = detteProjetee > indPrev.dette + 1;
  const alerteDeficit = soldeTotal < -6;
  const alerteDette = detteProjetee > 140;
  return (
    <div>
      <ScreenTitle icon="wallet" title={conseil ? "Le dernier budget du président" : `Budget ${BASE_YEAR + year}`} sub={conseil ? "Année conseil (ne compte pas) — aidez le président sortant avec quelques leviers clés." : `Année ${year}/${YEARS} — ajustez par crans. Les taux se conservent d'une année sur l'autre.`} />
      {conseil && (
        <div style={{ background: C.card2, border: `1px solid ${C.gold}55`, borderRadius: 12, padding: 14, marginBottom: 12, display: "flex", gap: 11, alignItems: "flex-start" }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="user-star" size={19} color={C.onAccent} /></div>
          <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.55 }}>
            <b style={{ color: C.ink }}>Votre mission :</b> le budget part avec <b style={{ color: C.coral }}>{fmt(-START.solde, 1)} % de déficit</b>. Essayez de le réduire. Deux pistes : <b style={{ color: C.mint }}>augmenter une recette</b> (onglet Recettes), ou <b style={{ color: C.coral }}>baisser une dépense</b> (onglet Dépenses). Mais attention : tout choix a un coût social.
          </div>
        </div>
      )}
      {!conseil && year === 1 && (
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start", background: C.gold + "1F", border: `1px solid ${C.gold}88`, borderRadius: 10, padding: "10px 13px", marginBottom: 12, fontSize: 12.5, color: C.sub, lineHeight: 1.55 }}>
          <Icon n="bulb" size={17} color={C.gold} style={{ flexShrink: 0, marginTop: 1 }} />
          <span><b style={{ color: C.ink }}>Première année de mandat :</b> tous les leviers sont désormais disponibles. Pour vous aider, un <b style={{ color: C.gold }}>cadre jaune</b> explique l'effet de chaque décision. À partir de la 2ᵉ année, à vous de jouer sans filet !</span>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[["rec", "Recettes", C.mint], ["dep", "Dépenses", C.coral]].map(([id, lab, col]) => (
          <button key={id} onClick={() => setTab(id)} style={{ position: "relative", flex: 1, padding: "9px 0", borderRadius: 9, cursor: "pointer", fontSize: 13.5, fontWeight: 500, border: `1px solid ${tab === id ? col : !visited[id] ? "#E0A96D" : C.line}`, background: tab === id ? col + "22" : "transparent", color: tab === id ? col : C.dim }}>
            {lab} <span style={{ opacity: .7, fontSize: 11 }}>({LEVERS.filter((l) => l.cat === id && inFilter(l)).length})</span>
            {!visited[id] && <span style={{ marginLeft: 6, fontSize: 10.5, color: "#E0A96D", fontWeight: 600 }}>● à voir</span>}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", fontSize: 11.5, color: C.dim, margin: "0 0 8px" }}>
        <span>Code couleur des effets :</span>
        <span style={{ color: C.mint, fontWeight: 600 }}>■ vert = améliore la situation du pays</span>
        <span style={{ color: C.coral, fontWeight: 600 }}>■ rouge = la dégrade</span>
        <span>(la flèche indique si l'indicateur monte ↑ ou baisse ↓)</span>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "2px 12px" }}>
        {visibleList.map((l) => (
          <LeverRow key={l.id} lever={l} level={levels[l.id] || 0} baseLevel={baseLevels[l.id] || 0} onChange={(v) => setLevel(l.id, v)} verbose={conseil || year === 1} />
        ))}
        {collapse && (
          <button onClick={() => setExpanded(true)} style={{ width: "100%", background: C.card, border: `1px dashed ${C.gold}88`, borderRadius: 10, padding: "12px 14px", color: C.gold, fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 44, touchAction: "manipulation" }}>
            <Icon n="chevron-down" size={16} /> Voir les {list.length - visibleList.length} leviers restants
          </button>
        )}
      </div>
      <div style={{ marginTop: 12, background: C.card2, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase" }}>Effet net sur le solde (cumulé)</div>
            <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 600, color: balance >= 0 ? C.mint : C.coral }}>{balance >= 0 ? "+" : ""}{fmt(balance * ECH)} Md€</div>
            {balance !== 0 && <div style={{ fontSize: 10.5, color: C.dim }}>soit {eqHab(balance * ECH)} et par an</div>}
          </div>
          <Btn kind="primary" onClick={handleValider}>{confirm && nonVus.length ? "Valider quand même" : conseil ? "Proposer ce budget" : "Valider le budget"} <Icon n="arrow-right" size={15} style={{ verticalAlign: -2 }} /></Btn>
        </div>
        {confirm && nonVus.length > 0 && (
          <div style={{ marginTop: 10, background: C.amberBg, border: "1px solid #E0A96D66", borderRadius: 9, padding: "9px 12px", color: "#E0A96D", fontSize: 12.5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Icon n="eye-off" size={16} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 180 }}>Vous n'avez pas ouvert l'onglet <b>« {nonVus[0][1]} »</b>. Jetez-y un œil avant de valider — c'est la moitié de votre budget !</span>
            <button onClick={() => setTab(nonVus[0][0])} style={{ background: "#E0A96D", color: C.onAccent, border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Voir les {nonVus[0][1].toLowerCase()}</button>
          </div>
        )}
        {/* Aperçu complet des conséquences prévues */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 10 }}>
          <PreviewChip label="Solde total" value={`${fmt(soldeTotal, 1)} %`} tone={soldeTotal < -6 ? "bad" : soldeTotal > -1 ? "good" : "mid"} />
          <PreviewChip label="Dette en 2031" value={`${fmt(detteProjetee, 0)} %`} tone={detteProjetee > 130 ? "bad" : detteProjetee < indPrev.dette ? "good" : "mid"} />
          <PreviewChip label="Croissance" value={`${preview.ind.croissance > 0 ? "+" : ""}${fmt(preview.ind.croissance, 1)} %`} delta={preview.ind.croissance - startYear(indPrev, year, doctrine).croissance} />
          <PreviewChip label="Chômage" value={`${fmt(preview.ind.chomage, 1)} %`} delta={-(preview.ind.chomage - indPrev.chomage)} />
        </div>
        <div style={{ fontSize: 11.5, color: C.sub, marginTop: 8, textAlign: "center", background: C.inset, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 10px" }}>
          Solde primaire <b style={{ fontFamily: "monospace" }}>{fmt(soldePrimaire, 1)} %</b> − charge de la dette <b style={{ fontFamily: "monospace", color: C.coral }}>{fmt(chargePct, 1)} %</b> (≈ {fmt(chargeMd)} Md€ ; taux moyen {fmt(tauxPrev, 2)} %, nouveaux emprunts à {fmt(marcheNext, 1)} %) = solde total <b style={{ fontFamily: "monospace", color: soldeTotal < -3 ? C.coral : C.gold }}>{fmt(soldeTotal, 1)} %</b>
        </div>
        <div style={{ fontSize: 11, color: C.dim, marginTop: 6, textAlign: "center" }}>
          Dette {fmt(indPrev.dette, 0)} % → <b style={{ color: detteMonte ? C.coral : C.mint }}>{fmt(detteProjetee, 0)} %</b> en fin de mandat si vous gardez ce cap.
        </div>
        {(alerteDeficit || alerteDette) && (
          <div style={{ marginTop: 10, background: C.coralBg, border: `1px solid ${C.coral}66`, borderRadius: 9, padding: "9px 12px", color: C.coral, fontSize: 12.5, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <Icon n="alert-triangle" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{alerteDeficit && `Déficit très élevé (${fmt(preview.ind.solde, 1)} %). `}{alerteDette && `À ce rythme, la dette grimpe à ${fmt(detteProjetee, 0)} % du PIB — risque de crise budgétaire. `}Pensez à augmenter des recettes ou réduire des dépenses.</span>
          </div>
        )}
        <div style={{ color: C.dim, fontSize: 11, marginTop: 8, textAlign: "center" }}>Prévision avant événements — les 3 cartes de l'année viendront tout bousculer.</div>
        {year > 1 && (
          <div style={{ color: C.dim, fontSize: 10.5, marginTop: 4, textAlign: "center", fontStyle: "italic", lineHeight: 1.4 }}>
            Le solde repart de sa base chaque année : vos choix budgétaires durables sont conservés, mais les chocs ponctuels de l'an dernier ne se répètent pas. Seule la <b style={{ fontStyle: "normal", color: C.sub }}>dette</b> s'accumule.
          </div>
        )}
      </div>
    </div>
  );
}
function PreviewChip({ label, value, tone, delta }) {
  let col = C.gold;
  if (tone === "bad") col = C.coral; else if (tone === "good") col = C.mint;
  else if (delta != null) col = delta > 0.03 ? C.mint : delta < -0.03 ? C.coral : C.gold;
  return (
    <div style={{ background: C.inset, border: `1px solid ${C.line}`, borderRadius: 9, padding: "7px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 600, color: col }}>{value}</div>
    </div>
  );
}

// Construit une phrase causale courte (« → chômage ↑, popularité ↓ ») selon le sens du réglage
function leverConseq(lever, d) {
  if (!d) return [];
  const s = Math.sign(d), out = [];
  // badUp : une hausse de cet indicateur est une mauvaise nouvelle
  const add = (val, nom, badUp) => { if (!val) return; const up = val * s > 0; out.push({ txt: `${nom} ${up ? "↑" : "↓"}`, good: badUp ? !up : up }); };
  add(lever.cat === "rec" ? -1 : 1, "déficit", true);
  if (lever.cro) add(lever.cro, "croissance", false);
  if (lever.cho) add(lever.cho, "chômage", true);
  if (lever.fx) { add(lever.fx.popularite, "popularité", false); add(lever.fx.cohesion, "cohésion", false); add(lever.fx.environnement, "environnement", false); }
  if (INEG[lever.id]) add(INEG[lever.id], "inégalités", true);
  return out.slice(0, 5);
}
// Explications concrètes, pensées pour des élèves de 16-17 ans : qui est touché, pourquoi.
const EXPLAIN = {
  tva: { up: "Tout ce que les Français achètent coûte un peu plus cher. Les ménages modestes, qui dépensent presque tout leur revenu, le ressentent le plus.", down: "Les prix baissent un peu en magasin : tout le monde gagne en pouvoir d'achat, surtout les ménages modestes." },
  ir: { up: "Les ménages qui gagnent le plus paient davantage : l'impôt sur le revenu est progressif (plus on gagne, plus le taux est élevé).", down: "Les contribuables, surtout les plus aisés, gardent plus d'argent ; l'État redistribue moins." },
  csg: { up: "Un prélèvement au même taux sur presque tous les revenus (salaires, retraites…) : le revenu net de chacun baisse un peu.", down: "Les salaires et les retraites nets augmentent un peu pour tout le monde." },
  is: { up: "Les entreprises paient plus d'impôt sur leurs bénéfices : il leur reste moins d'argent pour investir et embaucher, et certaines peuvent partir à l'étranger.", down: "Les entreprises gardent plus de bénéfices : cela peut les encourager à investir et à s'installer en France." },
  cotpat: { up: "Embaucher un salarié coûte plus cher aux entreprises : elles hésitent davantage à recruter.", down: "Un salarié coûte moins cher à l'entreprise : cela favorise l'embauche, mais la Sécurité sociale reçoit moins d'argent." },
  cotsal: { up: "Le salaire net (ce que le salarié touche vraiment sur son compte) baisse : moins de pouvoir d'achat.", down: "Le salaire net augmente : les salariés ont plus de pouvoir d'achat." },
  patrimoine: { up: "Les très gros patrimoines paient davantage. C'est très redistributif, mais cela rapporte peu (quelques milliards d'euros) et certains grands contribuables peuvent s'installer à l'étranger.", down: "Les grandes fortunes sont moins taxées : l'écart entre les plus riches et les autres se creuse." },
  successions: { up: "Les héritages et les donations sont davantage taxés : cela limite la transmission des inégalités d'une génération à l'autre, mais c'est très impopulaire.", down: "Les héritages sont moins taxés : les familles transmettent davantage, mais les inégalités de patrimoine se perpétuent." },
  ecolo: { up: "L'essence, le gaz et l'énergie polluante coûtent plus cher : cela pousse à moins polluer, mais ceux qui dépendent de leur voiture le vivent mal (comme lors du mouvement des « gilets jaunes » en 2018).", down: "Le carburant et l'énergie coûtent moins cher : soulagement pour les automobilistes, mais moins d'incitation à polluer moins." },
  retraites: { up: "Les pensions des retraités augmentent : des millions de personnes en profitent, mais c'est déjà le premier poste de dépense publique.", down: "Les pensions augmentent moins vite (ou l'âge de départ recule) : retraités et futurs retraités sont mécontents." },
  sante: { up: "Plus de moyens pour les hôpitaux et les soins : moins d'attente aux urgences, des soignants plus nombreux.", down: "Moins de moyens pour la santé : hôpitaux sous tension, attente plus longue, déserts médicaux." },
  education: { up: "Plus de professeurs et de meilleures conditions d'étude : c'est un investissement pour l'avenir, qui rapporte sur le long terme.", down: "Moins de moyens pour l'école : classes plus chargées. L'économie est immédiate, mais l'avenir des jeunes en pâtit." },
  aides: { up: "Le RSA, les APL, la prime d'activité augmentent : les ménages modestes dépensent presque tout cet argent, ce qui fait aussi travailler les commerces.", down: "Les aides aux plus modestes baissent : l'État économise, mais la pauvreté et les inégalités augmentent." },
  invest: { up: "L'État finance des transports, la transition écologique, la recherche : cela crée des emplois aujourd'hui et de la croissance demain.", down: "Moins d'investissement public : économie immédiate, mais moins de croissance et d'emplois à l'avenir." },
  defense: { up: "Plus de moyens pour l'armée : le pays est mieux protégé et l'industrie de défense embauche.", down: "Moins de moyens pour l'armée : l'État économise, mais la France est moins bien équipée face aux menaces." },
  securite: { up: "Plus de policiers, de juges et de moyens pour la justice : les Français se sentent plus en sécurité.", down: "Moins de moyens pour la police et la justice : procédures plus lentes, sentiment d'insécurité." },
  fonction: { up: "L'État recrute ou augmente ses fonctionnaires : plus d'emplois publics et des services publics plus présents.", down: "On ne remplace pas tous les fonctionnaires qui partent à la retraite : grosse économie, mais des services publics moins présents (guichets, écoles, hôpitaux…)." },
  agences: { up: "Plus de moyens pour les agences publiques (emploi, santé, environnement…) : elles assurent mieux leurs missions.", down: "On fusionne les agences qui font doublon et on en supprime certaines : l'État économise, mais certains services (accompagnement des chômeurs, santé, environnement) peuvent se dégrader." },
  subventions: { up: "Plus d'aides aux entreprises et aux associations : soutien à l'activité et à la vie locale (clubs, culture…).", down: "Moins d'aides aux entreprises et associations : économie rapide, mais certaines activités ralentissent ou ferment." },
  collectivites: { up: "Plus d'argent pour les communes et les régions : plus de services de proximité (écoles, transports, équipements sportifs…).", down: "Moins d'argent pour les communes et les régions : elles réduisent leurs services ou augmentent les impôts locaux." },
};
// Message d'impact structuré : budget / concrètement / bonne nouvelle / mais attention.
function leverImpactSentence(lever, d) {
  if (!d) return null;
  const rec = lever.cat === "rec", up = d > 0, s = Math.sign(d);
  const eur = Math.abs(d * lever.eurStep) * ECH;
  const hab = fmt(parHabitant(eur), 0);
  let budget;
  if (rec) budget = up ? `L'État encaisse environ ${fmt(eur, 0)} milliards d'euros de plus par an (≈ ${hab} € par habitant) : le déficit diminue.` : `L'État perd environ ${fmt(eur, 0)} milliards d'euros par an (≈ ${hab} € par habitant) : le déficit augmente.`;
  else budget = up ? `Cela coûte environ ${fmt(eur, 0)} milliards d'euros de plus par an (≈ ${hab} € par habitant) : le déficit augmente.` : `L'État économise environ ${fmt(eur, 0)} milliards d'euros par an (≈ ${hab} € par habitant) : le déficit diminue.`;
  const plus = [], moins = [];
  // isGood(v) : l'effet "v" (dans le sens du réglage) est-il bon pour le pays ?
  const sort = (v, goodIfUp, txtUp, txtDown) => {
    if (!v) return; const effUp = v * s > 0;
    (effUp === goodIfUp ? plus : moins).push(effUp ? txtUp : txtDown);
  };
  sort(lever.cro, true, "la croissance accélère", "la croissance ralentit");
  sort(lever.cho, false, "le chômage augmente", "le chômage recule");
  if (lever.fx) {
    sort(lever.fx.popularite, true, "votre popularité monte", "votre popularité baisse");
    sort(lever.fx.cohesion, true, "la société est plus unie", "le mécontentement grandit");
    sort(lever.fx.environnement, true, "l'environnement progresse", "l'environnement recule");
  }
  sort(INEG[lever.id], false, "les inégalités augmentent", "les inégalités diminuent");
  const ex = EXPLAIN[lever.id];
  return { budget, concret: ex ? (up ? ex.up : ex.down) : "", plus: plus.slice(0, 3), moins: moins.slice(0, 3) };
}
// Détecte un écran étroit (mobile) et se met à jour si l'utilisateur tourne l'écran ou redimensionne.
function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const upd = () => setM(mq.matches);
    upd(); mq.addEventListener ? mq.addEventListener("change", upd) : mq.addListener(upd);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", upd) : mq.removeListener(upd); };
  }, []);
  return m;
}
function ImpactBox({ info }) {
  if (!info) return null;
  const line = { margin: "0 0 4px" };
  return (
    <div style={{ flex: 1 }}>
      <p style={line}><b>💶 Budget :</b> {info.budget}</p>
      {info.concret && <p style={line}><b>👀 Concrètement :</b> {info.concret}</p>}
      {info.plus.length > 0 && <p style={{ ...line, color: "#14532d" }}><b>👍 Bonne nouvelle :</b> {info.plus.join(", ")}.</p>}
      {info.moins.length > 0 && <p style={{ margin: 0, color: "#8b1c1c" }}><b>⚠️ Mais attention :</b> {info.moins.join(", ")}.</p>}
    </div>
  );
}
function LeverRow({ lever, level, baseLevel, onChange, verbose = false }) {
  const isMobile = useIsMobile();
  const [impactOpen, setImpactOpen] = useState(false);
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
        <button onClick={() => setInfo(!info)} title="Explication" style={{ background: "none", border: "none", cursor: "pointer", color: info ? C.gold : C.dim, padding: 10, margin: -10, display: "flex", touchAction: "manipulation" }}><Icon n="help-circle" size={15} /></button>
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
          <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{conseq.map((c, i) => <span key={i} style={{ fontSize: 10.5, fontWeight: 600, color: c.good ? C.mint : C.coral, background: (c.good ? C.mint : C.coral) + "1F", border: `1px solid ${(c.good ? C.mint : C.coral)}55`, borderRadius: 5, padding: "1px 6px" }}>{c.txt}</span>)}</span>
          <span style={{ fontSize: 10, color: C.dim, whiteSpace: "nowrap" }}>{eqHab(dEur)}</span>
        </div>
      )}
      {!changed && <div style={{ fontSize: 10.5, color: C.dim, paddingLeft: 25, marginTop: 2 }}>{lever.hint}</div>}
      {/* Mode conseil : message d'impact dans un cadre jaune TRÈS visible */}
      {verbose && changed && (() => { const info = leverImpactSentence(lever, level - baseLevel); if (!info) return null;
        const compact = isMobile && !impactOpen;
        return (
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12.5, color: "#3A2E0A", lineHeight: 1.55, background: C.gold, border: `2px solid ${C.gold}`, boxShadow: `0 0 0 3px ${C.gold}33`, borderRadius: 10, padding: "11px 13px", marginTop: 9, marginLeft: 25, fontWeight: 500 }}>
          <Icon n="bulb" size={18} color="#3A2E0A" style={{ flexShrink: 0, marginTop: 1 }} />
          {compact ? (
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 2px" }}><b>💶 Budget :</b> {info.budget}</p>
              <button onClick={() => setImpactOpen(true)} style={{ background: "none", border: "none", color: "#3A2E0A", textDecoration: "underline", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: "6px 0", minHeight: 40, touchAction: "manipulation" }}>Voir le détail complet ▾</button>
            </div>
          ) : (
            <div style={{ flex: 1 }}>
              <ImpactBox info={info} />
              {isMobile && <button onClick={() => setImpactOpen(false)} style={{ background: "none", border: "none", color: "#3A2E0A", textDecoration: "underline", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: "6px 0", minHeight: 40, touchAction: "manipulation" }}>Réduire ▴</button>}
            </div>
          )}
        </div>
        ); })()}
      {info && <div style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.5, background: C.inset, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", marginTop: 6, marginLeft: 25 }}><Icon n="bulb" size={12} color={C.gold} /> {lever.hint}</div>}
    </div>
  );
}
const stepBtn = { width: 40, height: 40, borderRadius: 8, border: `1px solid ${C.line}`, background: C.inset, color: C.ink, fontSize: 19, fontWeight: 600, cursor: "pointer", lineHeight: 1, touchAction: "manipulation" };

/* ---------- Écran Événements ---------- */
function EventScreen({ event, index, total, onChoose }) {
  const t = TYPES[event.type];
  return (
    <div>
      {/* En-tête : numéro d'événement bien visible + progression */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 600, color: C.ink, fontFamily: "Fraunces,serif" }}>Événement {index + 1} <span style={{ color: C.dim, fontSize: 15 }}>sur {total}</span></span>
        <div style={{ display: "flex", gap: 5 }}>{Array.from({ length: total }).map((_, i) => <div key={i} style={{ width: 26, height: 5, borderRadius: 3, background: i <= index ? C.gold : C.line }} />)}</div>
      </div>
      <div style={{ background: C.card2, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: t.color + "26", color: t.color, fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 20, marginBottom: 10 }}>
          <Icon n={t.icon.replace("ti-", "")} size={14} /> {t.label}
        </div>
        {event.hist && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: 8, background: C.gold + "26", color: C.gold, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, marginBottom: 10 }}><Icon n="history" size={13} /> Événement historique réel</div>}
        {!event.hist && CURRENT_ERA.id !== "today" && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: 8, background: C.line, color: C.dim, fontSize: 11, padding: "3px 10px", borderRadius: 20, marginBottom: 10 }}>Situation imaginée (non historique)</div>}
        <h3 style={{ margin: "0 0 6px", color: C.ink, fontSize: 19, fontFamily: "Fraunces,serif", fontWeight: 600 }}>{event.title}</h3>
        <p style={{ margin: "0 0 14px", color: C.sub, fontSize: 13.5, lineHeight: 1.6 }}>{event.desc}</p>
        {event.contexte && <HistContext text={event.contexte} />}
        {/* Consigne claire */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.gold, fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
          <Icon n="hand-click" size={16} /> Sélectionnez l'un des {event.choices.length} choix ci-dessous :
        </div>
        <div style={{ display: "grid", gap: 9 }}>
          {event.choices.map((ch, i) => <ChoiceRow key={i} choice={ch} num={i + 1} onClick={() => onChoose(ch)} />)}
        </div>
      </div>
    </div>
  );
}
function ChoiceRow({ choice, num, onClick }) {
  const fxChips = Object.entries(choice.fx).map(([k, v]) => {
    const m = k === "soldeDur" ? { label: "Solde (chaque année)" } : IND_META.find((x) => x.id === k); if (!m) return null;
    const good = ["chomage", "dette", "inflation", "inegalites"].includes(k) ? v < 0 : v > 0;
    return <span key={k} style={{ fontSize: 10.5, fontFamily: "monospace", color: good ? C.mint : C.coral, background: C.inset, padding: "1px 6px", borderRadius: 5, border: `1px solid ${C.line}` }}>{m.label} {v > 0 ? "+" : ""}{fmt(v, 1)}</span>;
  }).filter(Boolean);
  return (
    <div style={{ background: C.inset, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 13px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <span style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: C.line, color: C.ink, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{num}</span>
        <span style={{ color: C.ink, fontSize: 14, flex: 1, lineHeight: 1.4 }}>{choice.label}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8, paddingLeft: 31 }}>{fxChips}</div>
      {(choice.fx.integrite || 0) <= -5 && (
        <div style={{ marginTop: 7, paddingLeft: 31, fontSize: 11, color: "#E0A96D", display: "flex", alignItems: "center", gap: 5 }}>
          <Icon n="alert-triangle" size={13} /> Entame fortement votre intégrité — risque de scandale plus tard.
        </div>
      )}
      <div style={{ paddingLeft: 31 }}>{choice.note && <Note text={choice.note} />}</div>
      {/* Bouton d'action bien visible */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <button onClick={onClick} style={{ background: C.gold, color: C.onAccent, border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          Faire ce choix <Icon n="arrow-right" size={15} />
        </button>
      </div>
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
  const pib = pibPrev * (1 + (ind.croissance + (ind.inflation ?? INFL_TREND)) / 100);
  let revBalance = 0;
  for (const lev of LEVERS) if (lev.cat === "rec") revBalance += (levels[lev.id] || 0) * lev.eurStep;
  const recettes = RECETTES0 * (pib / PIB) + revBalance * ECH;
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
  let pib = PIB * ECH;
  const rows = history.map((h) => {
    pib = pib * (1 + (h.ind.croissance + (h.ind.inflation ?? INFL_TREND)) / 100);
    const P = h.pib ?? pib;
    const rec = h.recettes ?? (RECETTES0 * (P / PIB));
    const dep = h.depenses ?? (rec - h.ind.solde * P / 100);
    return { x: "'" + String(BASE_YEAR + h.year).slice(2), dette: h.ind.dette, chomage: h.ind.chomage, pib: P, rec, dep, taux: h.taux, marche: h.marche, inflation: h.ind.inflation };
  });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <ChartFrame title="Dette (% du PIB)">
        <LineChartSVG data={rows.map((r) => ({ x: r.x, y: +r.dette.toFixed(1) }))} color={C.coral} refValue={DETTE0} refLabel={`départ ${fmt(DETTE0, 0)}`} decimals={0} />
      </ChartFrame>
      <ChartFrame title="PIB (Md€)">
        <LineChartSVG data={rows.map((r) => ({ x: r.x, y: Math.round(r.pib) }))} color={C.mint} decimals={0} />
        <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.4, marginTop: 4 }}>PIB nominal (en euros courants) : il progresse avec la croissance <em>et</em> l'inflation (~1,3 %/an supposée).</div>
      </ChartFrame>
      <ChartFrame title="Recettes vs Dépenses (Md€)" legend={[{ label: "Recettes", color: C.mint }, { label: "Dépenses", color: C.coral }]}>
        <GroupedBarsSVG data={rows.map((r) => ({ x: r.x, a: r.rec, b: r.dep }))} colorA={C.mint} colorB={C.coral} />
      </ChartFrame>
      <ChartFrame title="Chômage (%)">
        <LineChartSVG data={rows.map((r) => ({ x: r.x, y: +r.chomage.toFixed(1) }))} color={C.gold} refValue={CHOM0} refLabel={`départ ${fmt(CHOM0, 1)}`} decimals={1} />
      </ChartFrame>
      <ChartFrame title="Inflation (%)">
        <LineChartSVG data={rows.map((r) => ({ x: r.x, y: +(r.inflation ?? INFL0).toFixed(1) }))} color="#E0A96D" refValue={INFL0} refLabel={`départ ${fmt(INFL0, 1)}`} decimals={1} />
        <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.4, marginTop: 4 }}>Hausse générale des prix sur un an. Au-delà de 5 %, le pouvoir d'achat fond rapidement.</div>
      </ChartFrame>
      {rows.some((r) => r.marche != null) && (
        <ChartFrame title="Taux des nouveaux emprunts (%)">
          <LineChartSVG data={rows.map((r) => ({ x: r.x, y: +(r.marche ?? MARCHE0).toFixed(1) }))} color="#B57BA6" refValue={MARCHE0} refLabel={`départ ${fmt(MARCHE0, 1)}`} decimals={1} />
          <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.4, marginTop: 4 }}>Prix auquel l'État emprunte aujourd'hui (OAT 10 ans). Il monte si les marchés s'inquiètent, baisse s'ils sont rassurés.</div>
        </ChartFrame>
      )}
      {rows.some((r) => r.taux != null) && (
        <ChartFrame title="Taux moyen de la dette (%)">
          <LineChartSVG data={rows.map((r) => ({ x: r.x, y: +(r.taux ?? TAUX0).toFixed(2) }))} color={C.coral} refValue={TAUX0} refLabel={`départ ${fmt(TAUX0, 1)}`} decimals={2} />
          <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.4, marginTop: 4 }}>Taux payé sur toute la dette. Il rattrape peu à peu le taux des nouveaux emprunts, à mesure que les vieux emprunts bon marché sont remplacés.</div>
        </ChartFrame>
      )}
    </div>
  );
}

/* ---------- Bilan d'année + Conseiller ---------- */
function YearSummary({ year, indBefore, ind, flags, onNext, onTable, history, ctx = {} }) {
  const isMobile = useIsMobile();
  const [openSec, setOpenSec] = useState(0); // sur mobile : seule une section est dépliée à la fois (la 1re par défaut)
  const bilan = useMemo(() => conseiller(indBefore, ind, flags), [indBefore, ind, flags]);
  const sections = useMemo(() => conseillerDetaille(indBefore, ind, flags, { ...ctx, year }), [indBefore, ind, flags, ctx, year]);
  const wins = useMemo(() => victoires(indBefore, ind), [indBefore, ind]);
  return (
    <div>
      <ScreenTitle icon="clipboard-check" title={`Bilan ${BASE_YEAR + year}`} sub="Voici l'état du pays après vos décisions" />
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
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="user-check" size={18} color="var(--on-accent)" /></div>
          <div><div style={{ color: C.ink, fontSize: 13.5, fontWeight: 500 }}>Le mot de votre conseiller</div><div style={{ color: C.dim, fontSize: 11 }}>Bilan de l'année {BASE_YEAR + year}</div></div>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {sections.map((sec, i) => {
            const folded = isMobile && openSec !== i;
            return (
            <div key={i} style={{ background: C.inset, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px" }}>
              {isMobile ? (
                <button onClick={() => setOpenSec(folded ? i : -1)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: 0, minHeight: 32, touchAction: "manipulation" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, color: sec.color, fontSize: 13, fontWeight: 600 }}><Icon n={sec.icon} size={15} /> {sec.t}</span>
                  <Icon n={folded ? "chevron-down" : "chevron-up"} size={16} color={C.dim} />
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: sec.color, fontSize: 13, fontWeight: 600, marginBottom: 4 }}><Icon n={sec.icon} size={15} /> {sec.t}</div>
              )}
              {!folded && <div style={{ color: C.sub, fontSize: 13, lineHeight: 1.6, marginTop: isMobile ? 7 : 0 }}>{sec.c}</div>}
            </div>
            ); })}
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
        <Btn kind="primary" onClick={onNext}>{year >= YEARS ? "Élection présidentielle" : `Passer à ${BASE_YEAR + 1 + year}`} <Icon n="arrow-right" size={15} style={{ verticalAlign: -2 }} /></Btn>
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
                <th style={{ ...thc, position: "sticky", left: 0, background: C.card, zIndex: 1 }}>Année</th>
                {IND_META.map((m) => <th key={m.id} style={{ ...thc, textAlign: "right" }}>{m.label}</th>)}
              </tr></thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.year} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={{ ...tdc, color: C.ink, position: "sticky", left: 0, background: C.card, zIndex: 1 }}>{BASE_YEAR + r.year}</td>
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
      <p style={{ color: C.dim, fontSize: 14 }}>Après {YEARS} ans, les Français jugent votre bilan…</p>
      {phase === 0
        ? <div style={{ color: C.gold, marginTop: 20, fontSize: 14 }}><Icon n="loader" size={18} /> Dépouillement en cours…</div>
        : <div style={{ marginTop: 20 }}><Btn kind="primary" onClick={onReveal}>Découvrir le verdict <Icon n="arrow-right" size={15} style={{ verticalAlign: -2 }} /></Btn></div>}
    </div>
  );
}

/* ---------- Débriefing ---------- */
function Debrief({ game, sc, end, leaderboard, newTrophies = [], onReplay, onHome }) {
  const podium = [...(leaderboard || [])].sort((a, b) => b.score - a.score);
  const wonNew = TROPHIES.filter((t) => newTrophies.includes(t.id));
  return (
    <div>
      {end.key === "triomphe" && <Confetti />}
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
            <div style={{ fontSize: 10.5, color: i === 3 ? "var(--on-accent)" : C.dim, textTransform: "uppercase", letterSpacing: ".04em" }}>{l} <span style={{ opacity: .7 }}>{w}</span></div>
            <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 600, color: i === 3 ? "var(--on-accent)" : indScoreCol(v) }}>{i === 3 ? <CountUp to={v} /> : v}</div>
          </div>
        ))}
      </div>
      {wonNew.length > 0 && (
        <div style={{ background: C.gold + "14", border: `1px solid ${C.gold}66`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.gold, fontSize: 14, fontWeight: 600, marginBottom: 10 }}><Icon n="trophy" size={18} /> {wonNew.length === 1 ? "Nouveau trophée débloqué !" : `${wonNew.length} nouveaux trophées débloqués !`}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {wonNew.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, background: C.card, border: `1px solid ${C.gold}`, borderRadius: 20, padding: "6px 13px 6px 7px" }}>
                <span style={{ width: 28, height: 28, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n={t.icon} size={15} color="var(--on-accent)" /></span>
                <span style={{ color: C.gold, fontSize: 13, fontWeight: 600 }}>{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.ink, fontSize: 15, fontWeight: 500, marginBottom: 12 }}><Icon n="school" size={18} color={C.gold} /> Le bilan pédagogique de votre mandat</div>
        <div style={{ display: "grid", gap: 13 }}>
          {leconDetaillee(game).map((s, i) => (
            <div key={i}>
              <div style={{ color: C.gold, fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{s.t}</div>
              <div style={{ color: C.sub, fontSize: 13, lineHeight: 1.6 }}>{s.c}</div>
            </div>
          ))}
        </div>
      </div>
      <HistoryComparison game={game} />
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
/* ---------- « Auriez-vous fait mieux ? » : comparaison avec le vrai mandat ---------- */
function HistoryComparison({ game }) {
  const e = eraById(game.eraId), info = ERA_INFO[e.id];
  if (!info || !info.fin) return null;
  const f = info.fin, me = game.ind;
  const rows = [
    { label: "Dette (% du PIB)", vous: me.dette, reel: f.dette, mieux: me.dette < f.dette, d: 0 },
    { label: "Solde public (% du PIB)", vous: me.solde, reel: f.solde, mieux: me.solde > f.solde, d: 1 },
    { label: "Chômage (%)", vous: me.chomage, reel: f.chomage, mieux: me.chomage < f.chomage, d: 1 },
    { label: "Inflation (%)", vous: me.inflation ?? 0, reel: f.inflation, mieux: (me.inflation ?? 0) < f.inflation, d: 1 },
  ];
  const nb = rows.filter((r) => r.mieux).length;
  const hist = (HIST_EVENTS[e.id] || []);
  const mine = (game.decisions || []).filter((d) => d.hist);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.gold}66`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.gold, fontSize: 16, fontWeight: 600, fontFamily: "Fraunces,serif", marginBottom: 4 }}><Icon n="scale" size={18} /> Auriez-vous fait mieux que {e.president} ?</div>
      <div style={{ color: C.sub, fontSize: 13, marginBottom: 10 }}>Vous faites mieux sur <b style={{ color: nb >= 3 ? C.mint : nb >= 2 ? C.gold : C.coral }}>{nb} indicateur{nb > 1 ? "s" : ""} sur 4</b> par rapport au vrai mandat ({f.note || `fin ${f.annee}`}).</div>
      {/* Cartes empilables : jamais de scroll horizontal, même sur petit écran */}
      <div style={{ display: "grid", gap: 7 }}>
        <div style={{ display: "flex", gap: 10, fontSize: 11, color: C.dim, padding: "0 10px" }}>
          <span style={{ flex: 1 }}>Indicateur</span><span style={{ width: 70, textAlign: "right" }}>Vous</span><span style={{ width: 70, textAlign: "right" }}>{e.president}</span>
        </div>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px", background: C.inset, border: `1px solid ${C.line}`, borderRadius: 9, padding: "9px 10px" }}>
            <span style={{ flex: "1 1 140px", color: C.ink, fontSize: 13 }}>{r.label}</span>
            <span style={{ width: 70, textAlign: "right", fontFamily: "monospace", color: r.mieux ? C.mint : C.coral, fontWeight: 600 }}>{fmt(r.vous, r.d)}</span>
            <span style={{ width: 70, textAlign: "right", fontFamily: "monospace", color: C.sub }}>{fmt(r.reel, r.d)}</span>
            <span style={{ flexBasis: "100%", textAlign: "right", fontSize: 11.5, color: r.mieux ? C.mint : C.coral }}>{r.mieux ? "✓ mieux" : "moins bien"}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>Attention : la comparaison est indicative. Le vrai président a aussi affronté d'autres contraintes (majorité parlementaire, conjoncture mondiale, cohabitation…).</div>
      {mine.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ color: C.ink, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Face aux grands événements : vos choix et ceux de l'Histoire</div>
          <div style={{ display: "grid", gap: 10 }}>
            {mine.map((d, i) => {
              const ev = hist.find((h) => h.id === d.eid); if (!ev) return null;
              const same = d.ci === ev.reel;
              return (
                <div key={i} style={{ background: C.inset, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <b style={{ color: C.ink, fontSize: 13 }}>{BASE_YEAR + d.year} · {ev.title}</b>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: same ? C.mint : C.gold }}>{same ? "Même choix que l'Histoire" : "Choix différent"}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}><b>Vous :</b> {d.choice}</div>
                  <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}><b>En réalité :</b> {ev.reelTexte}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
      <button onClick={() => setOpen(!open)} style={{ background: "none", border: "none", cursor: "pointer", color: C.ink, fontSize: 14, fontWeight: 500, minHeight: 44, touchAction: "manipulation", display: "flex", alignItems: "center", gap: 6, padding: 0, width: "100%" }}>
        <Icon n="list-check" size={16} color={C.gold} /> Vos {decisions.length} décisions face aux événements
        <span style={{ marginLeft: "auto", color: C.dim }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {Object.keys(byYear).sort((a, b) => a - b).map((y) => (
            <div key={y}>
              <div style={{ fontSize: 11, color: C.gold, fontWeight: 500, marginBottom: 4 }}>{BASE_YEAR + Number(y)}</div>
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
function TrophiesView({ unlocked, onBack }) {
  const have = new Set(unlocked || []);
  return (
    <div>
      <ScreenTitle icon="trophy" title="Vos trophées" sub={`${have.size} / ${TROPHIES.length} débloqués — rejouez pour tous les obtenir !`} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {TROPHIES.map((t) => {
          const got = have.has(t.id);
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 11, background: got ? C.gold + "18" : C.card, border: `1px solid ${got ? C.gold : C.line}`, borderRadius: 12, padding: 12, opacity: got ? 1 : 0.6 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: got ? C.gold : C.line, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon n={got ? t.icon : "lock"} size={21} color={got ? "var(--on-accent)" : C.dim} />
              </div>
              <div>
                <div style={{ color: got ? C.gold : C.dim, fontSize: 13.5, fontWeight: 600 }}>{t.label}</div>
                <div style={{ color: C.sub, fontSize: 11.5, lineHeight: 1.4 }}>{t.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
      <Btn kind="primary" onClick={onBack}><Icon n="arrow-left" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Retour</Btn>
    </div>
  );
}
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
  const [newTrophies, setNewTrophies] = useState([]);
  const [pickedEra, setPickedEra] = useState("today");
  const [setup, setSetup] = useState(null);                 // code/team/doctrine retenus pour la vraie partie
  const [conseil, setConseil] = useState(null);             // état de l'année conseil (ne compte pas)
  const [conseilWork, setConseilWork] = useState({});
  const [conseilEvts, setConseilEvts] = useState([]);
  const [conseilEvtIdx, setConseilEvtIdx] = useState(0);
  const [theme, setTheme] = useState("dark");
  useEffect(() => { (async () => { const t = await storage.get("quinq:theme"); if (t === "light" || t === "dark") setTheme(t); })(); }, []);
  useEffect(() => { try { document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : ""); } catch {} storage.set("quinq:theme", theme); }, [theme]);
  const [unlockedTrophies, setUnlockedTrophies] = useState([]);
  const [hasSave, setHasSave] = useState(false);
  const [boardCode, setBoardCode] = useState("STMG");

  const doctrineOf = (g) => DOCTRINES.find((d) => d.id === g.doctrineId);

  useEffect(() => { (async () => { const s = await storage.get(saveKey("STMG", "__any__")); if (s) setHasSave(true); })(); }, []);

  const persist = useCallback(async (g) => {
    await storage.set(saveKey(g.code, g.team), g);
    await storage.set(saveKey("STMG", "__any__"), { code: g.code, team: g.team });
    setHasSave(true);
  }, []);

  function start(code, team, doctrineId, eraId = "today") {
    applyEra(eraId);
    const g = { code, team, doctrineId, eraId, year: 1, ind: { ...START }, levels: {}, taux: TAUX0, tauxMarche: MARCHE0, history: [], usedIds: [], pendingFlags: [] };
    setGame(g); setWorkLevels({}); setScreen("mission"); persist(g);
  }
  // --- Année conseil (guidée, ne compte pas) ---
  function startConseil(code, team, doctrineId, eraId = "today") {
    applyEra(eraId);
    setSetup({ code, team, doctrineId, eraId });
    setConseil({ ind: { ...START }, taux: TAUX0, marche: MARCHE0 });
    setConseilWork({}); setConseilEvts([]); setConseilEvtIdx(0);
    setScreen("conseil_intro");
  }
  function validateConseil() {
    const res = applyBudgetYear(conseil.ind, conseilWork, {}, 1, null);
    const sp = res.ind.solde;
    const m = computeMarche(MARCHE0, conseil.ind.dette, sp, conseil.ind.inflation);
    const t = computeMoyen(TAUX0, m, conseil.ind.dette, sp);
    const cp = t * conseil.ind.dette / 100;
    const indTotal = { ...res.ind, solde: clamp(sp - cp, -18, 8) };
    setConseil({ ind: indTotal, taux: t, marche: m });
    setConseilEvts(drawEvents(1, [], [], null, 2)); setConseilEvtIdx(0);
    setScreen("conseil_events");
  }
  function chooseConseilEvent(choice) {
    const newInd = applyFx(conseil.ind, choice.fx);
    if (conseilEvtIdx + 1 < conseilEvts.length) { setConseil({ ...conseil, ind: newInd }); setConseilEvtIdx(conseilEvtIdx + 1); }
    else { const fr = finalizeYear(newInd, conseil.taux, conseil.marche); setConseil({ ...conseil, ind: fr.ind }); setScreen("conseil_bilan"); }
  }
  async function resume() {
    const ptr = await storage.get(saveKey("STMG", "__any__")); if (!ptr) return;
    const g = await storage.get(saveKey(ptr.code, ptr.team));
    if (g) { applyEra(g.eraId || "today"); setGame(g); setWorkLevels({ ...(g.levels || {}) }); setScreen("budget"); }
  }

  function validateBudget() {
    const doc = doctrineOf(game);
    const res = applyBudgetYear(game.ind, workLevels, game.levels, game.year, doc);
    // Le taux réagit au budget voté ; la charge de la dette est appliquée TOUT DE SUITE,
    // pour que le "Solde" affiché soit le solde TOTAL de façon cohérente (et non le primaire).
    const soldePrimaire = res.ind.solde;
    const tauxMarche = computeMarche(game.tauxMarche ?? MARCHE0, game.ind.dette, soldePrimaire, game.ind.inflation);
    const taux = computeMoyen(game.taux ?? TAUX0, tauxMarche, game.ind.dette, soldePrimaire);
    const chargePct = taux * game.ind.dette / 100;
    const indTotal = { ...res.ind, solde: clamp(soldePrimaire - chargePct, -18, 8) };
    setIndBefore(game.ind);                         // état avant l'année (pour le conseiller)
    const drawn = drawEvents(game.year, game.usedIds, game.pendingFlags, game.code + ":" + (game.eraId || "today"));
    setEvts(drawn); setEvtIdx(0);
    setGame({ ...game, ind: indTotal, levels: { ...workLevels }, _prevLevels: { ...(game.levels || {}) }, _tauxPrev: game.taux ?? TAUX0, _marchePrev: game.tauxMarche ?? MARCHE0, tauxMarche, taux, _soldePrim: +soldePrimaire.toFixed(1), _chargeMd: Math.round(chargePct * PIB * ECH / 100), _chargePct: +chargePct.toFixed(2), _chargePctPrev: game._chargePct ?? +(TAUX0 * DETTE0 / 100).toFixed(2) });
    setScreen("events");
  }

  function chooseEvent(choice) {
    const ev = evts[evtIdx];
    const newInd = applyFx(game.ind, choice.fx);
    const usedIds = [...game.usedIds, ev.id];
    const decisions = [...(game.decisions || []), { year: game.year, event: ev.title, type: ev.type, choice: choice.label, solde: (choice.fx.solde || 0) + (choice.fx.soldeDur || 0), eid: ev.id, ci: ev.choices.indexOf(choice), hist: !!ev.hist }];
    if (evtIdx + 1 < evts.length) { setGame({ ...game, ind: newInd, usedIds, decisions }); setEvtIdx(evtIdx + 1); }
    else {
      const fr = finalizeYear(newInd, game.taux ?? TAUX0, game.tauxMarche ?? MARCHE0);
      const finalInd = fr.ind, fl = fr.flags;
      const pibPrev = game.history.length ? game.history[game.history.length - 1].pib : PIB * ECH;
      const flows = computeFlows(finalInd, game.levels, pibPrev);
      const history = [...game.history, { year: game.year, ind: finalInd, taux: game.taux, marche: game.tauxMarche, charge: game._chargeMd, soldePrimaire: game._soldePrim, ...flows }];
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
    // Une fin catastrophique plafonne le score : impossible de "bien noter" un mandat qui s'effondre.
    if (["faillite", "chaos", "scandale"].includes(e.key)) score.total = Math.min(score.total, 35);
    setSc(score); setEnd(e);
    const eraTag = game.eraId && game.eraId !== "today" ? ` · ${eraById(game.eraId).debut}` : "";
    const entry = { team: game.team, score: score.total, eco: score.eco, social: score.social, politique: score.politique, ending: e.title + eraTag, date: Date.now() };
    const existing = (await storage.get(lbKey(game.code), true)) || [];
    const updated = [...existing.filter((x) => x.team !== game.team), entry];
    await storage.set(lbKey(game.code), updated, true);
    // Trophées : calculer les gagnés, repérer les NOUVEAUX, fusionner et persister
    const won = trophiesWon(game, score, e).map((t) => t.id);
    const stored = (await storage.get(TROPHY_KEY)) || [];
    const fresh = won.filter((id) => !stored.includes(id));
    await storage.set(TROPHY_KEY, [...new Set([...stored, ...won])]);
    setNewTrophies(fresh);
    await storage.del(saveKey(game.code, game.team)); await storage.del(saveKey("STMG", "__any__"));
    setHasSave(false); setBoard(updated); setScreen("debrief");
  }
  async function openLeaderboard(code) { setBoardCode(code); const e = (await storage.get(lbKey(code), true)) || []; setBoard(e); setScreen("leaderboard"); }
  async function openTrophies() { const t = (await storage.get(TROPHY_KEY)) || []; setUnlockedTrophies(t); setScreen("trophies"); }

  const progress = game ? ((game.year - 1) / YEARS) * 100 : 0;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "Inter,system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap');
        @import url('https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/3.11.0/tabler-icons.min.css');
        :root {
          --bg:#12203A; --card:#182B4C; --card2:#1B2E52; --line:#2C4372;
          --gold:#F4C64A; --mint:#8FD1B0; --coral:#F19A9A;
          --ink:#F6F1E4; --sub:#B7C4DC; --dim:#8CA0C4;
          --inset:#0F1B32; --on-accent:#12203A; --track:#1E3157;
          --coral-bg:#3A1E1E; --amber-bg:#3A2E1A;
        }
        :root[data-theme="light"] {
          --bg:#EEF2F8; --card:#FFFFFF; --card2:#F7FAFE; --line:#D4DEEC;
          --gold:#A9780C; --mint:#2E8F62; --coral:#C44A41;
          --ink:#17233E; --sub:#3C4B66; --dim:#64748C;
          --inset:#EDF1F8; --on-accent:#12203A; --track:#DCE4F0;
          --coral-bg:#FBE6E4; --amber-bg:#FBF0DD;
        }
        * { box-sizing: border-box; }
        body { background: var(--bg); }
        button:hover { filter: brightness(1.08); }
        @keyframes qfall { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(105vh) rotate(720deg); opacity: 0.9; } }
        @keyframes qpulse { 0% { box-shadow: 0 0 0 0 rgba(143,209,154,0.5); } 70% { box-shadow: 0 0 0 7px rgba(143,209,154,0); } 100% { box-shadow: 0 0 0 0 rgba(143,209,154,0); } }
        .qwin { animation: qpulse 1.2s ease-out 2; }
        @keyframes qglow { 0%,100% { opacity: .75 } 50% { opacity: 1 } }
        .qwinglow { animation: qglow 3.5s ease-in-out infinite; }
        .qposter { transition: transform .15s ease, box-shadow .15s ease; } .qposter:hover { transform: translateY(-3px); box-shadow: 0 8px 22px rgba(0,0,0,.35); }
        ::-webkit-scrollbar { height: 8px; width: 8px; } ::-webkit-scrollbar-thumb { background: var(--line); border-radius: 4px; }`}</style>
      <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} title={theme === "light" ? "Passer en mode sombre" : "Passer en mode clair"}
        style={{ position: "fixed", top: 12, right: 12, zIndex: 40, width: 38, height: 38, borderRadius: 10, cursor: "pointer", background: C.card, border: `1px solid ${C.line}`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon n={theme === "light" ? "moon" : "sun"} size={19} />
      </button>
      <div style={{ maxWidth: ["home", "mission", "era"].includes(screen) ? 1040 : 760, margin: "0 auto", padding: ["home", "mission", "era"].includes(screen) ? "40px 24px 48px" : "18px 16px 40px" }}>
        {conseil && ["conseil_budget", "conseil_events"].includes(screen) && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.gold + "22", color: C.gold, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, marginBottom: 8 }}><Icon n="user-star" size={13} /> Année conseil — ne compte pas</div>
            <HUD ind={conseil.ind} />
          </div>
        )}
        {game && screen !== "home" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="building-bank" size={17} color="var(--on-accent)" /></div>
                <div><div style={{ color: C.ink, fontSize: 14, fontWeight: 500, lineHeight: 1 }}>{game.team}</div><div style={{ color: C.dim, fontSize: 11 }}>{eraLabel(eraById(game.eraId))} · {doctrineOf(game)?.label} · {game.code}</div></div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: C.dim, fontSize: 10, textTransform: "uppercase" }}>Mandat</div>
                <div style={{ color: C.gold, fontFamily: "monospace", fontSize: 16, fontWeight: 600, lineHeight: 1 }}>Année {Math.min(game.year, YEARS)}<span style={{ color: C.line, fontSize: 12 }}>/{YEARS}</span></div>
              </div>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: C.track, overflow: "hidden" }}><div style={{ width: `${progress}%`, height: "100%", background: C.gold, transition: "width .4s" }} /></div>
            {["budget", "events"].includes(screen) && <div style={{ marginTop: 10 }}><HUD ind={game.ind} /><ObjBar ind={game.ind} /><MarketStrip taux={game.taux ?? TAUX0} marche={game.tauxMarche ?? MARCHE0} dette={game.ind.dette} /></div>}
          </div>
        )}

        {screen === "home" && <Home hasSave={hasSave} onPickEra={(id) => { setPickedEra(id); setScreen("era"); }} onResume={resume} onLeaderboard={openLeaderboard} onTrophies={openTrophies} />}
        {screen === "era" && <EraSetup eraId={pickedEra} onStart={startConseil} onSkipConseil={start} onBack={() => setScreen("home")} />}
        {screen === "conseil_intro" && setup && <ConseilIntro team={setup.team} onGo={() => setScreen("conseil_budget")} />}
        {screen === "conseil_budget" && conseil && <BudgetScreen year={1} indPrev={conseil.ind} baseLevels={{}} levels={conseilWork} setLevels={setConseilWork} doctrine={null} taux={TAUX0} marche={MARCHE0} onValidate={validateConseil} leverFilter={ESSENTIAL} conseil={true} />}
        {screen === "conseil_events" && conseil && conseilEvts[conseilEvtIdx] && <EventScreen key={conseilEvts[conseilEvtIdx].id} event={conseilEvts[conseilEvtIdx]} index={conseilEvtIdx} total={conseilEvts.length} onChoose={chooseConseilEvent} />}
        {screen === "conseil_bilan" && conseil && <ConseilBilan indBefore={START} ind={conseil.ind} onElection={() => setScreen("election_intro")} />}
        {screen === "election_intro" && setup && <ElectionIntro team={setup.team} onElected={() => start(setup.code, setup.team, setup.doctrineId, setup.eraId)} />}
        {screen === "trophies" && <TrophiesView unlocked={unlockedTrophies} onBack={() => setScreen("home")} />}
        {screen === "mission" && game && <Mission team={game.team} doctrine={doctrineOf(game)} onGo={() => setScreen("budget")} />}
        {screen === "budget" && game && <BudgetScreen year={game.year} indPrev={game.ind} baseLevels={game.levels} levels={workLevels} setLevels={setWorkLevels} doctrine={doctrineOf(game)} taux={game.taux ?? TAUX0} marche={game.tauxMarche ?? MARCHE0} onValidate={validateBudget} />}
        {screen === "events" && game && evts[evtIdx] && <EventScreen key={evts[evtIdx].id} event={evts[evtIdx]} index={evtIdx} total={evts.length} onChoose={chooseEvent} />}
        {screen === "summary" && game && <YearSummary year={game.year} indBefore={indBefore} ind={game.ind} flags={flags} onNext={nextYear} onTable={() => setScreen("table")} history={game.history} ctx={{ levels: game.levels, prevLevels: game._prevLevels || {}, decisions: (game.decisions || []).filter((d) => d.year === game.year), taux: game.taux, tauxPrev: game._tauxPrev, marche: game.tauxMarche, marchePrev: game._marchePrev, chargeMd: game._chargeMd, chargePct: game._chargePct, chargePctPrev: game._chargePctPrev }} />}
        {screen === "table" && game && <ResultsTable history={game.history} onClose={() => setScreen("summary")} />}
        {screen === "election" && game && <Election onReveal={reveal} />}
        {screen === "debrief" && game && sc && end && <Debrief game={game} sc={sc} end={end} leaderboard={board} newTrophies={newTrophies} onReplay={() => start(game.code, game.team, game.doctrineId, game.eraId)} onHome={() => { setGame(null); setScreen("home"); }} />}
        {screen === "leaderboard" && <LeaderboardView code={boardCode} entries={board} onBack={() => setScreen("home")} />}
      </div>
    </div>
  );
}
