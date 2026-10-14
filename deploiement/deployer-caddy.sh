#!/usr/bin/env bash
# DÉPLOIE le Caddyfile du dépôt + SONDE le routage réel. Si une route d'API tombe
# en statique (ou l'inverse), ROLLBACK du Caddyfile PRÉCÉDENT : un matching cassé
# ne RESTE PAS en place (filet bloquant, pas simple alerte).
#
# La sonde est LE témoin du vrai risque (la précédence @api/file_server n'est pas
# testable sous le gate vitest-only). Trois durcissements :
#  1. assert sur le CORPS (signature que SEUL Node produit), pas le code HTTP seul ;
#  2. teste une page INEXISTANTE → NE doit PAS atteindre Node (prouve que @api ne déborde pas) ;
#  3. backup de l'ancien AVANT la copie → le rollback restaure le bon fichier.
set -uo pipefail  # pas -e : on gère les échecs nous-mêmes (pour rollback)

APP="${APP:-/opt/zurvela/app}"
SRC="$APP/deploiement/Caddyfile"
DST=/etc/caddy/Caddyfile
BAK=/etc/caddy/Caddyfile.precedent
# On tape le Caddy LOCAL avec le bon hôte (SNI/Host), sans dépendre du hairpin DNS.
C="curl -s -m 8 --resolve api.zurvela.com:443:127.0.0.1"
BASE="https://api.zurvela.com"

echo "### 1/4 validation syntaxe du nouveau Caddyfile (avant de toucher à quoi que ce soit)"
if ! caddy validate --config "$SRC" --adapter caddyfile >/dev/null 2>&1; then
  echo "ÉCHEC : le Caddyfile du dépôt est invalide (syntaxe). Rien n'est touché." >&2
  exit 1
fi

echo "### 2/4 backup de l'ancien + mise en place + reload"
cp "$DST" "$BAK"            # durcissement 3 : l'ANCIEN (celui qui tourne), avant la copie
cp "$SRC" "$DST"
systemctl reload caddy
sleep 2

echo "### 3/4 SONDE du routage réel (corps Node vs page statique)"
echoue=0
verifier_node() { # $1 chemin lisible, $2 corps obtenu — doit contenir une signature Node
  if echo "$2" | grep -q "$3"; then echo "    $1 → Node ✓"; else echo "    $1 → PAS Node (corps: ${2:-vide})"; echoue=1; fi
}
verifier_node "GET /sante"        "$($C "$BASE/sante")"                                                   '"ok":true'
verifier_node "POST /verifier"    "$($C -X POST "$BASE/verifier" -H 'content-type: application/json' -d '{}')" '"erreur":"url-requise"'
# LE CAS CROISÉ : /scanner doit atteindre Node, pas être masqué par le statique.
verifier_node "POST /scanner"     "$($C -X POST "$BASE/scanner" -H 'content-type: application/json' -d '{}')"  '"erreur":"url-requise"'
# L'INVERSE (durcissement 2) : une page INEXISTANTE ne doit PAS atteindre Node.
page="$($C "$BASE/page-inexistante-de-sonde-$(date +%s)")"
if echo "$page" | grep -q '"erreur"'; then echo "    page inexistante → atteint Node (@api DÉBORDE ! corps: $page)"; echoue=1; else echo "    page inexistante → statique ✓ (@api ne déborde pas)"; fi

echo "### 4/4 verdict"
if [ "$echoue" -ne 0 ]; then
  echo "ROUTAGE CASSÉ → ROLLBACK du Caddyfile précédent." >&2
  cp "$BAK" "$DST"
  systemctl reload caddy
  echo "rollback effectué : le matching cassé n'est PAS resté. (exit 2)" >&2
  exit 2
fi
rm -f "$BAK"
echo "ROUTAGE OK : chaque route d'API atteint Node, aucune page ne la masque."
