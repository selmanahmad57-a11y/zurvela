#!/usr/bin/env bash
# DÉPLOIE le Caddyfile du dépôt + SONDE le routage réel. Si une route d'API tombe
# en statique (ou l'inverse), ROLLBACK du Caddyfile PRÉCÉDENT : un matching cassé
# ne RESTE PAS en place (filet bloquant, pas simple alerte).
#
# APPRENTISSAGE n°58 (mécanisé) : cette sonde n'instancie JAMAIS un second Caddy.
# Elle recharge le service systemd EN PLACE (reload-or-restart) et l'interroge par
# requêtes HTTP. Aucun `caddy run` — le canal admin partagé :2019 n'a pas
# d'occasion d'exister (un `caddy run` sur l'hôte prendrait la main sur la prod).
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
# On tape le Caddy LOCAL avec le bon hôte (SNI/Host) via --resolve, sans hairpin DNS.
# -k : la sonde teste le ROUTAGE (quel nom va où), PAS le certificat — un nom
# fraîchement ajouté (app) peut servir un cert interne le temps que Let's Encrypt
# émette, alors que son routage est déjà en place. La validité du cert PUBLIC est
# confirmée à part (curl réel après déploiement + l'ACME de Caddy lui-même).
CURL="curl -s -k -m 8"

echo "### 1/4 validation syntaxe du nouveau Caddyfile (avant de toucher à quoi que ce soit)"
if ! caddy validate --config "$SRC" --adapter caddyfile >/dev/null 2>&1; then
  echo "ÉCHEC : le Caddyfile du dépôt est invalide (syntaxe). Rien n'est touché." >&2
  exit 1
fi

echo "### 2/4 UI → webroot lisible par caddy, backup de l'ancien, mise en place, reload"
# L'UI vit en /opt/zurvela (750, illisible par caddy) ; on la synchronise vers un
# webroot lisible. a+rX : lisible par l'utilisateur `caddy`.
rm -rf /var/www/zurvela-ui && mkdir -p /var/www/zurvela-ui
cp -r "$APP/deploiement/ui/." /var/www/zurvela-ui/
chmod -R a+rX /var/www/zurvela-ui
cp "$DST" "$BAK"            # durcissement 3 : l'ANCIEN (celui qui tourne), avant la copie
cp "$SRC" "$DST"
systemctl reload-or-restart caddy
sleep 2

echo "### 3/4 SONDE du routage réel (corps Node vs page statique), POUR CHAQUE NOM"
echoue=0
verifier_node() { # $1 chemin lisible, $2 corps obtenu, $3 signature que SEUL Node produit
  if echo "$2" | grep -q "$3"; then echo "    $1 → Node ✓"; else echo "    $1 → PAS Node (corps: ${2:-vide})"; echoue=1; fi
}
sonder_nom() { # $1 = nom (api.zurvela.com / app.zurvela.com) — MÊME service attendu
  local nom="$1"
  local C="$CURL --resolve $nom:443:127.0.0.1"
  local BASE="https://$nom"
  echo "  — $nom —"
  # ATTENDRE QUE LE CERT SOIT PRÊT avant de juger le routage. Un nom FRAÎCHEMENT ajouté
  # n'a pas encore son certificat (ACME Let's Encrypt : résolution LE + challenge HTTP-01,
  # ~10-60s) ; tant que Caddy n'a AUCUN cert, le TLS échoue (code 000), ce qui ferait un
  # FAUX négatif de routage → rollback d'un matching pourtant correct. On poll /sante
  # jusqu'à ce qu'il réponde (cert prêt), max ~120s. Sur un nom déjà certifié : instantané.
  local pret=0 i
  for i in $(seq 1 40); do
    if [ "$($C -o /dev/null -w '%{http_code}' "$BASE/sante")" != "000" ]; then pret=1; break; fi
    sleep 3
  done
  if [ "$pret" -ne 1 ]; then echo "    $nom → jamais serveable en ~120s (cert ACME non obtenu ?)"; echoue=1; return; fi
  verifier_node "GET /sante"     "$($C "$BASE/sante")"                                                       '"ok":true'
  verifier_node "POST /verifier" "$($C -X POST "$BASE/verifier" -H 'content-type: application/json' -d '{}')" '"erreur":"url-requise"'
  # LE CAS CROISÉ : /scanner doit atteindre Node, pas être masqué par le statique.
  verifier_node "POST /scanner"  "$($C -X POST "$BASE/scanner"  -H 'content-type: application/json' -d '{}')" '"erreur":"url-requise"'
  # L'INVERSE (durcissement 2) : une page INEXISTANTE ne doit PAS atteindre Node.
  local page; page="$($C "$BASE/page-inexistante-de-sonde-$(date +%s)")"
  if echo "$page" | grep -q '"erreur"'; then echo "    page inexistante → atteint Node (@api DÉBORDE ! corps: $page)"; echoue=1; else echo "    page inexistante → statique ✓ (@api ne déborde pas)"; fi
  # file_server SERT bien la page (sinon une permission passerait pour du « statique ») : GET / → 200.
  local racine; racine="$($C -o /dev/null -w '%{http_code}' "$BASE/")"
  if [ "$racine" = "200" ]; then echo "    GET / → page servie ✓"; else echo "    GET / → NON servie (code $racine — permission webroot ?)"; echoue=1; fi
}
# Les DEUX noms servent le MÊME scanner : ajouter app ne doit casser ni app ni api.
sonder_nom api.zurvela.com
sonder_nom app.zurvela.com

echo "### 4/4 verdict"
if [ "$echoue" -ne 0 ]; then
  echo "ROUTAGE CASSÉ → ROLLBACK du Caddyfile précédent." >&2
  cp "$BAK" "$DST"
  systemctl reload-or-restart caddy
  echo "rollback effectué : le matching cassé n'est PAS resté. (exit 2)" >&2
  exit 2
fi
rm -f "$BAK"
echo "ROUTAGE OK : chaque route d'API atteint Node, aucune page ne la masque."
