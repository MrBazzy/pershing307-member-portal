# Server Baseline — Pershing307 TDA

Dit document beschrijft de vaste configuratie van de TDA-server.
Gebruik dit als referentie bij onderhoud, storingen of herinstallatie.

---

## Locaties

| Onderdeel       | Pad / Waarde                        |
|-----------------|-------------------------------------|
| Projectmap      | `/home/barry/apps/pershing307`      |
| Webroot         | `/var/www/pershing307`              |
| API-poort       | `3000` (intern, niet publiek open)  |
| Nginx-site      | `pershing307-tda`                   |
| PM2-proces      | `pershing307-api`                   |
| Database        | `pershing307_tda`                   |
| Databasegebruiker | `pershing_app`                    |

---

## Software-componenten

| Component    | Versie  | Doel                                      |
|--------------|---------|-------------------------------------------|
| Node.js      | LTS     | JavaScript-runtime voor de API            |
| PNPM         | LTS     | Pakketbeheer voor het project             |
| PostgreSQL   | 15+     | Relationele database                      |
| Nginx        | Stabiel | Webserver / reverse proxy naar poort 3000 |
| PM2          | Stabiel | Procesbeheer — herstart API bij crash     |

---

## Netwerk / Firewall

UFW is actief. Alleen de volgende poorten zijn open:

| Poort    | Protocol | Omschrijving          |
|----------|----------|-----------------------|
| 22       | TCP      | SSH (beheer)          |
| 80       | TCP      | HTTP (Nginx frontend) |

HTTPS (443) wordt op dit moment niet gebruikt.
Alle andere poorten zijn geblokkeerd.

---

## Aanvullende diensten

| Dienst             | Omschrijving                                         |
|--------------------|------------------------------------------------------|
| QEMU Guest Agent   | Communicatie tussen VM en hypervisor (VirtIO-kanaal) |

---

## Omgevingsvariabelen

Gevoelige waarden (databasewachtwoord, sessie-geheim, e.d.) staan in:

```
/home/barry/apps/pershing307/.env
```

Dit bestand is **niet** opgenomen in Git. Bewaar een beveiligde kopie buiten de server.

---

## Nuttige commando's

```bash
# Health check uitvoeren
bash /home/barry/apps/pershing307/scripts/health.sh

# PM2-status bekijken
pm2 list

# Nginx herladen na configuratiewijziging
sudo nginx -t && sudo systemctl reload nginx

# PostgreSQL-status
sudo systemctl status postgresql

# UFW-status
sudo ufw status verbose
```

---

*Laatste update: juni 2025*
