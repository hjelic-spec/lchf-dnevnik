# Porki

Jednostavna aplikacija za kontrolu težine – optimizirana za LCHF / keto, a podržava i umjereni low-carb, mediteransku, visokoproteinsku i uravnoteženu prehranu.

- **Prehrana i ciljevi** – odabir načina prehrane i izračun dnevnih kalorija i makronutrijenata (Mifflin-St Jeor, aktivnost, tempo mršavljenja)
- **Recepti** – 20 recepata s hranjivim vrijednostima po porciji, filtrirani prema odabranoj prehrani; porciju dodaješ u obrok jednim dodirom
- **Izvještaji e-mailom** – HTML izvještaj za prošli tjedan i kumulativno od početka ili odabranog datuma (težina, makronutrijenti, bilanca, očekivano vs. stvarno, ketoni, post, grafovi); otvara se e-mail s upisanom adresom i izvještajem u privitku, uz tjedni podsjetnik
- **Danas** – brzi unos težine, neto ugljikohidrati prema dnevnom limitu, makronutrijenti, potrošene kalorije i energetska bilanca (ručni unos potrošnje za 30–90 dana unatrag), zadnje mjerenje ketona
- **Hrana** – nutritivni pregled zadnjeg obroka (UH, proteini, masti, kcal, raspodjela i stanje dana: što je u deficitu ili preko limita), najčešće korištene namirnice za brzi unos, unos po porciji ili na 100 g
- **Baza namirnica** – 148 namirnica u 8 sekcija (govedina i teletina, svinjetina, perad, riba, jaja i mliječni, masti, povrće, orašasti plodovi, voće, pića, dodaci) s oznakama „ograničeno“ i „izbjegavati“ + online pretraga [Open Food Facts](https://world.openfoodfacts.org)
- **Skener barkoda** – kamera prepozna EAN kod, vrijednosti se povuku iz Open Food Factsa i zapamte za sljedeći put
- **Post** – timer s ciljem (12–24 h), početak od zadnjeg obroka, faze posta, obavijest kad je cilj ostvaren (Android) i tjedni pregled u Analizi
- **Težina** – graf s 7-dnevnim prosjekom, tempo kg/tjedan, BMI, procjena kad ćeš doći do cilja
- **Ketoni** – Keto-Diastix trakice (ketoni + glukoza), pregled zadnjih 30 dana, upozorenja
- **Analiza** – tjedni prosjeci, automatski uvidi, očekivani gubitak iz kalorijske bilance u usporedbi sa stvarnim (tjedan i 8 tjedana) s objašnjenjem i zdravstvenim savjetima, grafovi, tablica po danima i trend zadnjih 8 tjedana
- **Android widget** – post s timerom, fazom i napretkom (pokreni ga gumbom „Započni“ bez otvaranja aplikacije), težina s promjenom od jučer, UH danas i očekivana promjena težine prema kalorijskoj bilanci (danas i 7 dana), zadnje mjerenje ketona i proteini danas; dodir na težinu otvara unos kg, na UH dodavanje hrane, na ketone karticu Ketoni

Svi podaci ostaju **samo na uređaju**. Sigurnosnu kopiju napraviš u Postavke → Izvezi kopiju: u Android aplikaciji otvara se izbornik Dijeli (Google disk, Datoteke, e-mail…), a u web-verziji se preuzima datoteka. Uvezi kopiju vraća podatke iz te datoteke (i s Google diska).

## Android aplikacija (preporučeno – automatski uvoz iz Health Connecta)

1. Na mobitelu otvori stranicu [Releases](https://github.com/hjelic-spec/porki/releases/latest) i preuzmi `porki.apk`.
2. Otvori datoteku i dopusti instalaciju iz tog izvora (Chrome / Datoteke → „Dopusti iz ovog izvora“).
3. Pokreni aplikaciju i dodirni **Dopusti** → odobri čitanje kalorija, koraka i težine.
4. Provjeri da tvoja aplikacija za sat ili aktivnost (Samsung Health, Google Fit, Fitbit, Garmin…) šalje podatke u Health Connect: *Postavke → Health Connect → Dozvole aplikacija*.

Aplikacija pri svakom otvaranju sinkronizira zadnjih 7 dana, a gumb „Sinkroniziraj“ zadnjih 30 dana. Ručni unos za neki dan ima prednost pred sinkronizacijom.
Za Health Connect je potreban Android 9 ili noviji. Od Androida 14 je ugrađen u sustav, a na starijim verzijama aplikacija nudi instalaciju s Play Storea.

**Ažuriranje:** instaliraj novi APK preko postojećeg. Podaci ostaju sačuvani dok je APK potpisan istim ključem (gradi se na istom računalu).

## Web-verzija

https://hjelic-spec.github.io/porki/ – radi u svakom pregledniku i može se instalirati na početni zaslon. Web ne može čitati Health Connect, pa se potrošnja unosi ručno. Web i Android aplikacija imaju **odvojene podatke** – prenesi ih izvozom i uvozom kopije.

## Razvoj

```
npm install
npm run serve          # web na http://localhost:5173
npm run apk            # sync + android/app/build/outputs/apk/debug/app-debug.apk
```

Za build je potreban JDK 21 (`JAVA_HOME`) i Android SDK. Kod je u `www/` (čisti HTML/CSS/JS, bez bundlera), a nativni most prema Health Connectu je u `android/app/src/main/java/hr/lchf/dnevnik/HealthBridgePlugin.kt`.
