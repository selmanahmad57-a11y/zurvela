# Déploiement — le serveur de scan public sur VPS (étape 7)

*L'hébergement : le serveur de scan tourne en continu sur un VPS Linux, derrière
un reverse-proxy HTTPS. Mis en service le 2026-10-10. Ce document est le runbook
(mesure préalable dans l'historique de l'étape 7 ; cahiers `publication-03..06`
pour le code).*

## L'infrastructure

- **VPS** : Hetzner **CX23** (2 vCPU, 4 Go RAM, 40 Go SSD), Ubuntu **24.04 LTS**,
  Nuremberg (eu-central). IP publique `167.233.84.241`.
- **Domaine** : `api.zurvela.com` → A `167.233.84.241` chez Cloudflare, **DNS only
  (grey cloud)** — pour que Caddy obtienne son certificat Let's Encrypt en direct.
  `zurvela.com` reste la vitrine statique OVH, inchangée.
- **Dimensionnement mesuré** : un scan = Node + Chromium headless ≈ **360 Mo au
  pic** (page légère), budget ~0,5–0,8 Go sur site lourd. La file est **1 scan à
  la fois** → on dimensionne pour UN scan concurrent + le serveur. 4 Go = confort.

## La pile

```
Internet ──HTTPS──> Caddy (:443, api.zurvela.com, cert Let's Encrypt auto)
                      └─reverse_proxy─> 127.0.0.1:8787  (service zurvela, systemd)
                                          └─ proxy filtrant d'egress ─> scans
```

- **Runtime** : Node 24 (NodeSource, `/usr/bin/node`), pnpm 12.5.1 (corepack),
  Playwright/Chromium (`/opt/zurvela/ms-playwright`, libs via `playwright
  install --with-deps chromium`).
- **Service applicatif** : `systemd` unit `zurvela.service`, `User=zurvela`
  (non-root), `ExecStart=/usr/bin/node --import tsx scripts/servir-public.ts`,
  `Restart=on-failure`, durci (`ProtectSystem=strict`, `ProtectHome`,
  `PrivateTmp`, `ReadWritePaths=/opt/zurvela`). Écoute `127.0.0.1:8787` (jamais
  exposé en direct). État durable : `/opt/zurvela/etat`.
- **Reverse-proxy** : Caddy (binaire statique officiel, `/usr/bin/caddy`),
  `systemd` unit `caddy.service`, `/etc/caddy/Caddyfile` =
  `api.zurvela.com { reverse_proxy 127.0.0.1:8787 }`. HTTPS + renouvellement
  automatiques.
- **Pare-feu** : `ufw` — seuls 22 (SSH), 80, 443 ouverts.

## Les secrets

- `/etc/zurvela/zurvela.env`, **`chmod 600 root:root`**, chargé par systemd
  `EnvironmentFile=`. Contient `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`,
  `RESEND_API_KEY`. **Jamais committé, jamais affiché.** Transit **par SSH**
  (jamais FTP). Sans `RESEND_API_KEY` : mode dégradé (scans OK, livraison par id).
- Accès SSH : clé `~/.ssh/zurvela_hetzner` (dev → VPS), la publique installée à
  la création du serveur.

## La garantie « seul du vert arrive en prod »

Le gate `pre-push` (`.githooks/pre-push`, `pnpm test`) est **local** : il protège
le push depuis la dev. L'**hôte ne POUSSE jamais — il ne fait que TIRER
`origin/main`** (dépôt public, `git pull` sans secret). Donc tout ce qui arrive
en prod est passé par le gate. *À durcir : un CI GitHub Actions qui rejoue la
suite à chaque push + branch protection (le hook local est contournable par
`--no-verify` et absent d'un clone neuf).*

## Mettre à jour la prod

Depuis la dev : committer + **pousser** (le gate `pnpm test` doit être vert).
Puis, sur le VPS (en root) :

```
/opt/zurvela/deploy.sh      # git pull --ff-only + pnpm install + playwright + restart + /sante
```

## Exploitation

```
systemctl status zurvela caddy          # état
journalctl -u zurvela -f -o cat         # logs appli (JSON)
journalctl -u caddy -f                   # logs reverse-proxy / TLS
curl -s http://127.0.0.1:8787/sante      # santé locale
curl -s https://api.zurvela.com/sante    # santé publique
```

Reset du quota : implicite à minuit UTC (clé `jourUTC|...`). État durable dans
`/opt/zurvela/etat/*.json` (jetons, preuves, scans, quota).

## Reste à faire (hors étape 7)

- L'**interface marchande** (coller une URL, guider dépôt-puis-scan) — avec la
  mitigation du cache CDN négatif (jeton frais par tentative) notée au BACKLOG.
- Durcir : CI serveur (GitHub Actions), envoi e-mail de contrôle vers un
  fournisseur externe, proxy Cloudflare + Origin Certificate si on veut masquer
  l'IP / la protection DDoS.
