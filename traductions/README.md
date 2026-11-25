# Traductions

- `data_fr.json` : les textes français des données (événements, époques…), dans l'ordre.
- `<langue>_data_*.txt` : leurs traductions, une ligne par texte : `numéro<TAB>traduction`.
- `<langue>_ui.json` : textes de l'interface (clé = phrase française, telle qu'écrite dans `tr("…")`).
- `glossaire.md` : traduction des termes français techniques (SMIC, CSG…), commune à toutes les langues.

Régénérer un dictionnaire après modification :

    node traductions/assemble.mjs en src/i18n/en.js

Si un texte français change dans `App.jsx`, mettre à jour la même phrase dans `data_fr.json`
(ou la clé de `<langue>_ui.json`), sinon sa traduction ne sera plus trouvée.
