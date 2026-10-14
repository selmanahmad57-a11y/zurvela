#!/usr/bin/env bash
# LOGIQUE DE DÉPLOIEMENT — VERSIONNÉE, sous le gate (elle contient la sonde et le
# rollback : elle ne doit pas vivre hors du dépôt, même principe que le Caddyfile).
#
# Le bootstrap `/opt/zurvela/deploy.sh` (sur le VPS) fait le `git pull` PUIS exécute
# ce script — donc tout ici arrive avec le code à jour. Réinstalle les dépendances,
# redémarre l'app, puis déploie+VALIDE le routage Caddy (sonde comportementale +
# rollback). Un routage cassé fait échouer le déploiement (exit non-zéro).
set -euo pipefail
APP="${APP:-/opt/zurvela/app}"
Z="sudo -u zurvela env HOME=/opt/zurvela PLAYWRIGHT_BROWSERS_PATH=/opt/zurvela/ms-playwright"

echo "### app : dépendances + navigateur + redémarrage"
$Z bash -c "cd $APP && pnpm install --frozen-lockfile && pnpm exec playwright install chromium"
systemctl restart zurvela
sleep 3
systemctl is-active zurvela && curl -sS -m 5 http://127.0.0.1:8787/sante && echo " — app à jour"

echo "### routage Caddy : déploiement + sonde + rollback"
bash "$APP/deploiement/deployer-caddy.sh"
