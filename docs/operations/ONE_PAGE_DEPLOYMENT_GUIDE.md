# Pershing307 — Beheershandleiding op één pagina

**Voor gebruik door: beheerder zonder IT-achtergrond**

---

## Stap 1 — Open MobaXterm

Start het programma **MobaXterm** op uw computer.
Klik op de opgeslagen verbinding voor de Pershing307-server.

Voer uw wachtwoord in als daarom gevraagd wordt.

---

## Stap 2 — Ga naar de projectmap

Typ het volgende in en druk op **Enter**:

```
cd /home/barry/apps/pershing307
```

---

## Stap 3 — Voer de health check uit

Typ het volgende in en druk op **Enter**:

```
bash scripts/health.sh
```

Wacht enkele seconden. U ziet een lijst met regels.

---

## Stap 4 — Lees het resultaat

Elke regel toont ofwel **[ OK ]** of **[FAIL]**.

### Alles staat op [ OK ]

De server werkt normaal. U kunt MobaXterm sluiten.

---

### Eén of meer regels staan op [FAIL]

Noteer **welke regel(s)** op FAIL staan.

Neem contact op met de technisch beheerder en geef door:
- De naam van de regel die FAIL toont
- De datum en tijd van uw controle

**Voer zelf geen verdere acties uit.**

---

## Vragen of twijfel?

Neem altijd eerst contact op met de technisch beheerder
voordat u iets aanpast of herstart.

---

*Pershing No. 307 — Beheershandleiding v1.0*
