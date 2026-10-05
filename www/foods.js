'use strict';
/* LCHF namirnice po sekcijama – vrijednosti na 100 g (EU način: UH bez vlakana), orijentacijske.
   Stavka: [naziv, UH, vlakna, masti, proteini, tipična porcija g]
   level grupe: 'limit' = ograničeno, 'avoid' = izbjegavati */
const FOOD_SECTIONS = [
  {
    title: 'Meso, riba i plodovi mora',
    intro: 'Temelj prehrane: proteini koji prirodno dolaze s mastima. Meso se jede s masnoćom i kožicom; kad možeš, biraj domaće i divlje podrijetlo.',
    groups: [
      { title: 'Meso i perad', items: [
        ['Slanina', 0.7, 0, 40, 13, 50],
        ['Pršut', 0.3, 0, 18, 26, 40],
        ['Kulen', 1, 0, 33, 24, 40],
        ['Zimska salama', 1, 0, 40, 24, 30],
        ['Kobasica, svinjska', 1, 0, 28, 15, 100],
        ['Hrenovke', 2, 0, 25, 12, 100],
        ['Junetina, mljevena (20 % masti)', 0, 0, 20, 17, 150],
        ['Junetina, rib-eye', 0, 0, 20, 19, 250],
        ['Svinjski vrat', 0, 0, 20, 17, 200],
        ['Svinjska rebra', 0, 0, 23, 16, 250],
        ['Janjetina', 0, 0, 21, 17, 200],
        ['Piletina, batak s kožom', 0, 0, 15, 17, 200],
        ['Piletina, prsa', 0, 0, 1.2, 23, 150],
        ['Puretina, prsa', 0, 0, 1, 24, 150],
        ['Divljač (srnetina)', 0, 0, 2.5, 22, 200]
      ] },
      { title: 'Iznutrice', items: [
        ['Pileća jetra', 0.7, 0, 4.8, 17, 100],
        ['Goveđa jetra', 3.9, 0, 3.6, 20, 100]
      ] },
      { title: 'Riba i plodovi mora', items: [
        ['Losos', 0, 0, 13, 20, 150],
        ['Skuša', 0, 0, 14, 19, 150],
        ['Srdele u ulju', 0, 0, 11, 25, 90],
        ['Pastrva', 0, 0, 6, 20, 150],
        ['Tuna u ulju, ocijeđena', 0, 0, 8, 29, 80],
        ['Bakalar', 0, 0, 0.7, 18, 150],
        ['Lignje', 3, 0, 1.4, 16, 150],
        ['Kozice / škampi', 0.9, 0, 0.5, 20, 150],
        ['Dagnje', 3.7, 0, 2.2, 12, 150]
      ] }
    ]
  },
  {
    title: 'Jaja i mliječni proizvodi',
    intro: 'Samo punomasne varijante – „light“ proizvodi često imaju dodani šećer i škrob.',
    groups: [
      { title: 'Jaja', items: [
        ['Jaje (1 kom ≈ 60 g)', 0.7, 0, 9.5, 12.6, 60]
      ] },
      { title: 'Mliječne masti', items: [
        ['Maslac', 0.1, 0, 81, 0.9, 10],
        ['Ghee (pročišćeni maslac)', 0, 0, 99.5, 0, 10],
        ['Slatko vrhnje 35 %', 3, 0, 35, 2.1, 50],
        ['Kiselo vrhnje 20 %', 3.5, 0, 20, 2.8, 50],
        ['Vrhnje za kuhanje 20 %', 3.5, 0, 20, 2.7, 50]
      ] },
      { title: 'Sirevi', items: [
        ['Sir gauda', 0, 0, 30, 25, 30],
        ['Sir podravec', 0, 0, 29, 25, 30],
        ['Sir edamer / trapist', 0.1, 0, 27, 26, 30],
        ['Parmezan', 0, 0, 29, 33, 20],
        ['Paški sir', 0, 0, 32, 30, 30],
        ['Mozzarella', 1, 0, 18, 18, 60],
        ['Halloumi', 2, 0, 25, 21, 60],
        ['Mascarpone', 4, 0, 44, 4.6, 50],
        ['Krem sir', 4, 0, 25, 6, 30],
        ['Svježi kravlji sir', 3, 0, 9, 12, 100]
      ] },
      { title: 'Ograničeno (više laktoze)', level: 'limit', items: [
        ['Grčki jogurt 10 %', 3.5, 0, 10, 5, 150],
        ['Feta', 1, 0, 21, 14, 50]
      ] }
    ]
  },
  {
    title: 'Zdrave masnoće i ulja',
    intro: 'Masti su glavni izvor energije. Biraj prirodne, hladno prešane i životinjske masti.',
    groups: [
      { title: 'Životinjske masti', items: [
        ['Svinjska mast', 0, 0, 100, 0, 10],
        ['Pačja mast', 0, 0, 100, 0, 10],
        ['Goveđi loj', 0, 0, 94, 1.5, 10]
      ] },
      { title: 'Ulja', items: [
        ['Maslinovo ulje', 0, 0, 100, 0, 10],
        ['Kokosovo ulje', 0, 0, 100, 0, 10],
        ['Ulje avokada', 0, 0, 100, 0, 10],
        ['Majoneza', 1, 0, 75, 1, 15]
      ] },
      { title: 'Cjelovite masne namirnice', items: [
        ['Avokado', 1.9, 6.7, 15, 2, 100],
        ['Masline, zelene', 0.5, 3.3, 15, 1, 30],
        ['Masline, crne', 2.8, 3.2, 11, 0.8, 30]
      ] }
    ]
  },
  {
    title: 'Povrće koje raste iznad zemlje',
    intro: 'Obavezan dio LCHF-a – biraj vrste s malo ugljikohidrata. Podzemno i škrobno povrće izbjegavaj.',
    groups: [
      { title: 'Lisnato povrće', items: [
        ['Zelena salata', 1.6, 1.3, 0.2, 1.4, 80],
        ['Špinat', 1.4, 2.2, 0.4, 2.9, 100],
        ['Blitva', 2.1, 1.6, 0.2, 1.8, 150],
        ['Rikola', 2, 1.6, 0.7, 2.6, 40],
        ['Kelj', 3.5, 3.6, 0.9, 3, 100]
      ] },
      { title: 'Ostalo nadzemno povrće', items: [
        ['Tikvica', 2.1, 1, 0.3, 1.2, 150],
        ['Šparoge', 1.9, 2.1, 0.1, 2.2, 100],
        ['Krastavac', 3.1, 0.5, 0.1, 0.7, 100],
        ['Brokula', 4, 2.6, 0.4, 2.8, 150],
        ['Cvjetača', 3, 2, 0.3, 1.9, 150],
        ['Šampinjoni', 2.3, 1, 0.3, 3.1, 100],
        ['Paprika, zelena', 2.9, 1.7, 0.2, 0.9, 100],
        ['Paprika, crvena', 4.2, 2.1, 0.3, 1, 100],
        ['Kupus', 3.3, 2.5, 0.1, 1.3, 100],
        ['Kiseli kupus', 1.4, 2.9, 0.1, 0.9, 100],
        ['Prokulica', 5.2, 3.8, 0.3, 3.4, 100],
        ['Mahune', 4.3, 2.7, 0.2, 1.8, 100],
        ['Patlidžan', 2.9, 3, 0.2, 1, 150],
        ['Rajčica', 2.7, 1.2, 0.2, 0.9, 100],
        ['Celer, stabljika', 1.4, 1.6, 0.2, 0.7, 50]
      ] },
      { title: 'Za začin, u malim količinama', level: 'limit', items: [
        ['Luk, crveni', 7.6, 1.7, 0.1, 1.1, 30],
        ['Češnjak', 31, 2.1, 0.5, 6.4, 5]
      ] },
      { title: 'Izbjegavati (podzemno i škrobno)', level: 'avoid', items: [
        ['Krumpir, kuhani', 17, 1.8, 0.1, 1.9, 150],
        ['Batat', 15.2, 2.5, 0.1, 1.4, 150],
        ['Mrkva', 6.8, 2.8, 0.2, 0.9, 80],
        ['Cikla', 8, 2, 0.2, 1.7, 80]
      ] }
    ]
  },
  {
    title: 'Orašasti plodovi, sjemenke i LCHF brašna',
    intro: 'Jedi umjereno – u većim količinama mogu kočiti mršavljenje.',
    groups: [
      { title: 'Oraščići', items: [
        ['Bademi', 9.1, 12.5, 50, 21, 30],
        ['Lješnjaci', 7, 9.7, 61, 15, 30],
        ['Orasi', 7, 6.7, 65, 15, 30],
        ['Makadamija', 5.2, 8.6, 76, 7.9, 30],
        ['Pekan orasi', 4.3, 9.6, 72, 9.2, 30],
        ['Brazilski orasi', 4.2, 7.5, 66, 14, 20]
      ] },
      { title: 'Sjemenke', items: [
        ['Chia sjemenke', 7.7, 34, 31, 17, 15],
        ['Lanene sjemenke', 1.6, 27, 42, 18, 15],
        ['Bučine sjemenke', 4.7, 6, 49, 30, 30],
        ['Suncokretove sjemenke', 11, 8.6, 51, 21, 30]
      ] },
      { title: 'Alternativna brašna', items: [
        ['Bademovo brašno', 10, 10, 52, 22, 30],
        ['Kokosovo brašno', 20, 39, 15, 19, 20],
        ['Psyllium (ljuskice)', 2, 80, 0.6, 1.5, 10]
      ] },
      { title: 'U manjim količinama', level: 'limit', items: [
        ['Indijski orah', 27, 3.3, 44, 18, 20],
        ['Kikiriki maslac', 12, 6, 50, 25, 20]
      ] }
    ]
  },
  {
    title: 'Voće (strogo ograničeno)',
    intro: 'Klasično voće ima previše šećera. Dopušteno je samo bobičasto voće u malim porcijama te limun i limeta.',
    groups: [
      { title: 'Bobičasto voće, male porcije', level: 'limit', items: [
        ['Maline', 5.4, 6.5, 0.7, 1.2, 80],
        ['Kupine', 4.3, 5.3, 0.5, 1.4, 80],
        ['Jagode', 5.7, 2, 0.3, 0.7, 100],
        ['Borovnice', 12.1, 2.4, 0.3, 0.7, 50]
      ] },
      { title: 'Za začinjavanje', items: [
        ['Limunov sok', 6.6, 0.3, 0.2, 0.4, 15],
        ['Sok limete', 7.7, 0.4, 0.1, 0.4, 15]
      ] },
      { title: 'Nije dopušteno', level: 'avoid', items: [
        ['Jabuka', 11.4, 2.4, 0.2, 0.3, 150],
        ['Banana', 20, 2.6, 0.3, 1.1, 120],
        ['Naranča', 9.4, 2.4, 0.1, 0.9, 150]
      ] }
    ]
  },
  {
    title: 'Pića',
    intro: 'Voda, nezaslađena kava i čaj. U kavu možeš dodati maslac ili slatko vrhnje – dodaj ih kao zasebnu stavku.',
    groups: [
      { title: 'Bez ugljikohidrata', items: [
        ['Voda', 0, 0, 0, 0, 250],
        ['Mineralna voda', 0, 0, 0, 0, 250],
        ['Crna kava', 0, 0, 0, 0.1, 200],
        ['Čaj, nezaslađeni', 0, 0, 0, 0, 250]
      ] },
      { title: 'Biljna mlijeka', items: [
        ['Bademovo mlijeko, nezaslađeno', 0.1, 0.4, 1.1, 0.4, 200],
        ['Kokosovo mlijeko (konzerva)', 2.8, 0, 18, 1.6, 100]
      ] }
    ]
  },
  {
    title: 'Dodaci i iznimke',
    intro: 'Dodaci koji olakšavaju LCHF i namirnice koje nisu dio LCHF-a – za dane s iznimkama.',
    groups: [
      { title: 'Dodaci', items: [
        ['Whey protein u prahu', 6, 0, 6, 75, 30],
        ['Kakao prah, nezaslađeni', 11, 30, 21, 23, 10],
        ['Eritritol (sladilo)', 0, 0, 0, 0, 10]
      ] },
      { title: 'Povremeno', level: 'limit', items: [
        ['Tamna čokolada 85 %', 19, 12, 46, 12.5, 20]
      ] },
      { title: 'Izvan LCHF-a', level: 'avoid', items: [
        ['Kruh, bijeli', 49, 2.7, 3.2, 9, 50],
        ['Riža, kuhana', 28, 0.4, 0.3, 2.7, 150],
        ['Tjestenina, kuhana', 30, 1.8, 0.9, 5.8, 150],
        ['Med', 82, 0.2, 0, 0.3, 10]
      ] }
    ]
  }
];

// Ravni popis za pretragu: [naziv, UH, vlakna, masti, proteini, porcija, level, sekcija]
const FOOD_DB = FOOD_SECTIONS.flatMap(s => s.groups.flatMap(g => g.items.map(i => [...i, g.level || '', s.title])));
