# Wat doet wat? — Uitleg in gewone taal

Dit document legt uit wat elk onderdeel van het Pershing307-systeem doet,
zonder technisch vakjargon.

---

## De onderdelen van het systeem

---

### PostgreSQL — de archiefkast

Alle gegevens van het portaal worden hier bewaard: leden, rollen, documenten,
instellingen. Zonder de archiefkast weet het systeem niets meer.

---

### API — de secretaris

De secretaris verwerkt alle verzoeken: een lid logt in, een document wordt
opgevraagd, een instelling wordt gewijzigd. De secretaris praat met de
archiefkast en geeft het antwoord terug aan de portier.

---

### Nginx — de portier

De portier staat aan de voordeur van de server. Bezoekers tikken het
webadres in, en de portier beslist waar het verzoek naartoe gaat.
Bezoekers praten nooit rechtstreeks met de secretaris.

---

### PM2 — de conciërge

De conciërge houdt de secretaris in de gaten. Als de secretaris om
welke reden dan ook stopt, zorgt de conciërge ervoor dat hij meteen
opnieuw opstart — zonder dat iemand er iets voor hoeft te doen.

---

### Frontend — de ontvangstruimte

Dit is wat leden zien in hun browser: de inlogpagina, het dashboard,
de documentenlijst. De ontvangstruimte communiceert met de secretaris
om gegevens op te halen en te tonen.

---

### .env — de kluis

In dit bestand liggen alle sleutels en wachtwoorden die het systeem
nodig heeft om te werken: het databasewachtwoord, de sessiesleutel, enzovoort.
Dit bestand is **nooit** zichtbaar in GitHub en mag **nooit** worden gedeeld.

---

### GitHub — de bouwplannen

Alle broncode van het portaal staat hier opgeslagen. Denk aan een
archief van tekeningen en bouwtekeningen. Elke wijziging aan de software
wordt hier vastgelegd, zodat u altijd kunt terugkijken wat er wanneer
is veranderd.

---

### Replit — de werkplaats

Dit is de digitale werkplek waar de ontwikkelaar de software bouwt en
test. Wijzigingen worden vanuit Replit naar GitHub gestuurd, en vandaar
naar de echte server.

---

### deploy.sh — de bouwploeg

Dit script haalt de nieuwste versie van de software op uit GitHub,
bouwt alles opnieuw op en herstart de secretaris. Denk aan een bouwploeg
die de werkzaamheden uitvoert zodra u het sein geeft.

---

### health.sh — de dokter

De dokter doet een snelle controle van alle onderdelen: klopt de
archiefkast nog? Werkt de portier? Draait de secretaris? Het resultaat
is simpel: **OK** of **FAIL**. De dokter verandert niets — hij kijkt alleen.

---

### rollback.sh — de tijdmachine

Als er iets misgaat na een update, kan de tijdmachine het systeem
terugzetten naar de vorige werkende versie. Gebruik dit alleen in overleg
met de technisch beheerder.

---

*Pershing No. 307 — Uitleg voor niet-technische beheerders v1.0*
