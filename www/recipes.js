'use strict';
/* Recepti. Sastojci su [naziv iz baze namirnica, grami]; hranjive vrijednosti računa aplikacija.
   diets: keto, lchf, lowcarb, medit, protein, balanced */
const RECIPES = [
  {
    id: 'omlet-slanina', name: 'Omlet sa slaninom, sirom i špinatom', cat: 'Doručak', time: 15, servings: 1,
    diets: ['keto', 'lchf', 'lowcarb', 'protein'],
    ingredients: [['Jaje (1 kom ≈ 60 g)', 180], ['Slanina', 40], ['Sir gauda', 30], ['Špinat', 50], ['Maslac', 10]],
    steps: ['Slaninu narezanu na kockice prži na tavi dok ne postane hrskava.', 'Dodaj maslac i špinat te kratko prodinstaj.', 'Umuti jaja sa soli i paprom, prelij preko i peci na laganoj vatri.', 'Pospi naribanim sirom, preklopi omlet i posluži.']
  },
  {
    id: 'chia-puding', name: 'Chia puding s kokosovim mlijekom i malinama', cat: 'Doručak', time: 5, servings: 1,
    diets: ['keto', 'lchf', 'lowcarb'],
    ingredients: [['Chia sjemenke', 25], ['Kokosovo mlijeko (konzerva)', 150], ['Maline', 40], ['Eritritol (sladilo)', 5]],
    steps: ['Pomiješaj chia sjemenke, kokosovo mlijeko i eritritol.', 'Promiješaj nakon 5 minuta pa ostavi u hladnjaku barem 2 sata (ili preko noći).', 'Posluži s malinama.']
  },
  {
    id: 'tuna-avokado', name: 'Salata od tune i avokada', cat: 'Ručak i večera', time: 10, servings: 1,
    diets: ['keto', 'lchf', 'lowcarb', 'protein', 'medit'],
    ingredients: [['Tuna u ulju, ocijeđena', 80], ['Avokado', 100], ['Rikola', 30], ['Majoneza', 15], ['Limunov sok', 10]],
    steps: ['Avokado prepolovi, izvadi koštičku i nareži na kockice.', 'Pomiješaj s ocijeđenom tunom, majonezom i limunovim sokom, posoli i popapri.', 'Posluži na rikoli.']
  },
  {
    id: 'losos-sparoge', name: 'Losos na maslacu sa šparogama', cat: 'Ručak i večera', time: 20, servings: 1,
    diets: ['keto', 'lchf', 'lowcarb', 'protein', 'medit', 'balanced'],
    ingredients: [['Losos', 150], ['Šparoge', 150], ['Maslac', 15], ['Limunov sok', 10]],
    steps: ['Šparogama odlomi tvrdi donji dio.', 'Losos posoli i peci na koži na maslacu 4 minute, okreni i peci još 2–3 minute.', 'U istoj tavi kratko ispeci šparoge.', 'Prelij limunovim sokom i posluži.']
  },
  {
    id: 'bataci-cvjetaca', name: 'Pečeni pileći bataci s cvjetačom', cat: 'Ručak i večera', time: 50, servings: 2,
    diets: ['keto', 'lchf', 'lowcarb', 'protein'],
    ingredients: [['Piletina, batak s kožom', 500], ['Cvjetača', 400], ['Maslinovo ulje', 30], ['Češnjak', 10]],
    steps: ['Pećnicu zagrij na 200 °C.', 'Batake natrljaj soli, paprom, paprikom i protisnutim češnjakom.', 'Cvjetaču razdijeli na cvjetiće i pomiješaj s maslinovim uljem i soli.', 'Peci sve zajedno 40–45 minuta dok koža ne postane hrskava.']
  },
  {
    id: 'lazanje-tikvice', name: 'Lazanje od tikvica s mljevenim mesom', cat: 'Ručak i večera', time: 70, servings: 4,
    diets: ['keto', 'lchf', 'lowcarb'],
    ingredients: [['Tikvica', 400], ['Junetina, mljevena (20 % masti)', 400], ['Rajčica', 200], ['Luk, crveni', 50], ['Češnjak', 10], ['Mozzarella', 125], ['Parmezan', 30], ['Maslinovo ulje', 15]],
    steps: ['Tikvice nareži uzdužno na tanke trake, posoli i ostavi 10 minuta pa obriši vodu.', 'Na ulju prodinstaj luk i češnjak, dodaj meso i prži dok ne porumeni.', 'Dodaj nasjeckanu rajčicu, začini i kuhaj 15 minuta.', 'U posudu slaži slojeve tikvica, mesa i mozzarelle; završi parmezanom.', 'Peci 35 minuta na 190 °C.']
  },
  {
    id: 'juneca-juha', name: 'Juneća juha s povrćem', cat: 'Juhe', time: 150, servings: 4,
    diets: ['keto', 'lchf', 'lowcarb', 'medit', 'protein', 'balanced'],
    ingredients: [['Junetina za juhu (prsa, rebra)', 500], ['Mrkva', 80], ['Celer, stabljika', 80], ['Luk, crveni', 50]],
    steps: ['Meso stavi u 2,5 l hladne vode i polako zakuhaj; skidaj pjenu.', 'Dodaj luk, mrkvu, celer, sol i papar u zrnu.', 'Kuhaj na laganoj vatri 2–2,5 sata.', 'Procijedi; meso i povrće posluži uz juhu.']
  },
  {
    id: 'teletina-gljive', name: 'Teleći odrezak u umaku od gljiva', cat: 'Ručak i večera', time: 25, servings: 2,
    diets: ['keto', 'lchf', 'lowcarb', 'protein'],
    ingredients: [['Teletina, odrezak (but)', 300], ['Šampinjoni', 200], ['Slatko vrhnje 35 %', 100], ['Maslac', 20], ['Luk, crveni', 30]],
    steps: ['Odreske lagano istuci, posoli i popapri.', 'Na maslacu ih ispeci 2–3 minute sa svake strane pa izvadi.', 'U istoj tavi prodinstaj luk i narezane gljive.', 'Dodaj vrhnje, kratko prokuhaj, vrati odreske u umak i posluži.']
  },
  {
    id: 'grcka-salata', name: 'Grčka salata s fetom', cat: 'Prilozi i salate', time: 10, servings: 2,
    diets: ['keto', 'lchf', 'lowcarb', 'medit', 'balanced'],
    ingredients: [['Krastavac', 150], ['Rajčica', 150], ['Paprika, zelena', 50], ['Luk, crveni', 20], ['Masline, crne', 40], ['Feta', 100], ['Maslinovo ulje', 20]],
    steps: ['Povrće nareži na krupne komade.', 'Dodaj masline i fetu.', 'Prelij maslinovim uljem, posoli i pospi origanom.']
  },
  {
    id: 'pire-cvjetaca', name: 'Pire od cvjetače', cat: 'Prilozi i salate', time: 20, servings: 4,
    diets: ['keto', 'lchf', 'lowcarb'],
    ingredients: [['Cvjetača', 400], ['Maslac', 30], ['Slatko vrhnje 35 %', 50], ['Parmezan', 20]],
    steps: ['Cvjetaču kuhaj u slanoj vodi 10–12 minuta dok ne omekša.', 'Dobro je ocijedi.', 'Izmiksaj s maslacem, vrhnjem i parmezanom; posoli i popapri.']
  },
  {
    id: 'vrat-kupus', name: 'Svinjski vrat s kiselim kupusom', cat: 'Ručak i večera', time: 120, servings: 4,
    diets: ['keto', 'lchf', 'lowcarb'],
    ingredients: [['Svinjski vrat', 600], ['Kiseli kupus', 500], ['Slanina', 60], ['Luk, crveni', 50]],
    steps: ['Na slanini prodinstaj luk.', 'Dodaj isprani kiseli kupus, lovor i papar u zrnu.', 'Na kupus položi posoljeni vrat, podlij s malo vode.', 'Peci poklopljeno 1,5 sat na 180 °C, zatim otkriveno još 20 minuta.']
  },
  {
    id: 'keto-kruh', name: 'Keto kruh od bademovog brašna', cat: 'Pekarski', time: 60, servings: 10,
    diets: ['keto', 'lchf', 'lowcarb'],
    ingredients: [['Bademovo brašno', 200], ['Jaje (1 kom ≈ 60 g)', 240], ['Psyllium (ljuskice)', 20], ['Maslac', 50]],
    steps: ['Pećnicu zagrij na 175 °C.', 'Pomiješaj bademovo brašno, psyllium, sol i 2 žličice praška za pecivo.', 'Umiješaj jaja i otopljeni maslac.', 'Izlij u obloženi kalup i peci 45–50 minuta. Reži tek kad se ohladi.']
  },
  {
    id: 'svjezi-sir-bobice', name: 'Svježi sir s jagodama i bademima', cat: 'Užine i slastice', time: 5, servings: 1,
    diets: ['lowcarb', 'protein', 'balanced', 'medit'],
    ingredients: [['Svježi kravlji sir', 200], ['Jagode', 100], ['Bademi', 15]],
    steps: ['Jagode nareži.', 'Svježi sir pomiješaj s jagodama i pospi nasjeckanim bademima.']
  },
  {
    id: 'zobena-kasa', name: 'Zobena kaša s grčkim jogurtom i borovnicama', cat: 'Doručak', time: 10, servings: 1,
    diets: ['medit', 'balanced', 'protein'],
    ingredients: [['Zobene pahuljice', 50], ['Mlijeko 3,2 %', 150], ['Grčki jogurt 10 %', 100], ['Borovnice', 80], ['Orasi', 15]],
    steps: ['Zobene pahuljice kuhaj u mlijeku 3–4 minute uz miješanje.', 'Ostavi da se malo ohladi pa umiješaj jogurt.', 'Posluži s borovnicama i nasjeckanim orasima.']
  },
  {
    id: 'piletina-kvinoja', name: 'Piletina s kvinojom i povrćem', cat: 'Ručak i večera', time: 30, servings: 1,
    diets: ['medit', 'balanced', 'protein'],
    ingredients: [['Piletina, prsa', 150], ['Kvinoja, kuhana', 150], ['Tikvica', 100], ['Paprika, crvena', 80], ['Maslinovo ulje', 10]],
    steps: ['Piletinu nareži na trakice, posoli i začini.', 'Na maslinovom ulju ispeci piletinu pa dodaj narezanu tikvicu i papriku.', 'Kad povrće omekša, umiješaj kuhanu kvinoju i kratko zagrij.']
  },
  {
    id: 'salata-leca', name: 'Salata od leće s fetom', cat: 'Prilozi i salate', time: 15, servings: 2,
    diets: ['medit', 'balanced'],
    ingredients: [['Leća, kuhana', 200], ['Rajčica', 100], ['Krastavac', 100], ['Luk, crveni', 20], ['Feta', 50], ['Maslinovo ulje', 15], ['Limunov sok', 10]],
    steps: ['Povrće nareži na kockice.', 'Pomiješaj s kuhanom lećom i izmrvljenom fetom.', 'Začini maslinovim uljem, limunovim sokom, solju i paprom.']
  },
  {
    id: 'pastrva-blitva', name: 'Pastrva s blitvom i krumpirom', cat: 'Ručak i večera', time: 35, servings: 1,
    diets: ['medit', 'balanced'],
    ingredients: [['Pastrva', 200], ['Blitva', 200], ['Krumpir, kuhani', 150], ['Maslinovo ulje', 15], ['Češnjak', 5]],
    steps: ['Krumpir i blitvu skuhaj u slanoj vodi.', 'Ocijedi, pomiješaj s maslinovim uljem i češnjakom (dalmatinski način).', 'Pastrvu posoli i ispeci na tavi ili gradelama.']
  },
  {
    id: 'tjestenina-tuna', name: 'Tjestenina s tunom i rajčicom', cat: 'Ručak i večera', time: 20, servings: 1,
    diets: ['medit', 'balanced'],
    ingredients: [['Tjestenina, kuhana', 200], ['Tuna u ulju, ocijeđena', 80], ['Rajčica', 150], ['Maslinovo ulje', 10], ['Češnjak', 5], ['Parmezan', 10]],
    steps: ['Na ulju prodinstaj češnjak i nasjeckanu rajčicu 5 minuta.', 'Dodaj tunu i začini.', 'Umiješaj kuhanu tjesteninu i pospi parmezanom.']
  },
  {
    id: 'puretina-brokula', name: 'Puretina s brokulom i rižom', cat: 'Ručak i večera', time: 25, servings: 1,
    diets: ['protein', 'balanced'],
    ingredients: [['Puretina, prsa', 200], ['Brokula', 150], ['Riža, kuhana', 100], ['Maslinovo ulje', 10]],
    steps: ['Puretinu nareži na komade i začini.', 'Ispeci je na maslinovom ulju.', 'Brokulu kuhaj na pari 5–6 minuta.', 'Posluži s rižom.']
  },
  {
    id: 'proteinski-omlet', name: 'Omlet od bjelanjaka s povrćem', cat: 'Doručak', time: 10, servings: 1,
    diets: ['protein', 'balanced', 'lowcarb'],
    ingredients: [['Bjelanjak', 200], ['Jaje (1 kom ≈ 60 g)', 60], ['Špinat', 50], ['Paprika, crvena', 50], ['Svježi kravlji sir', 50], ['Maslinovo ulje', 5]],
    steps: ['Na ulju kratko prodinstaj papriku i špinat.', 'Umuti bjelanjke s jajem, posoli i prelij preko povrća.', 'Dodaj svježi sir, peci na laganoj vatri i preklopi.']
  }
];
