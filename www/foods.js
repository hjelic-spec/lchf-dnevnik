'use strict';
/* Osnovne LCHF namirnice – vrijednosti na 100 g (EU način: UH bez vlakana), orijentacijske.
   [naziv, UH, vlakna, masti, proteini, tipična porcija g] */
const FOOD_DB = [
  ['Jaje (1 kom ≈ 60 g)', 0.7, 0, 9.5, 12.6, 60],
  ['Slanina', 0.7, 0, 40, 13, 50],
  ['Maslac', 0.1, 0, 81, 0.9, 10],
  ['Maslinovo ulje', 0, 0, 100, 0, 10],
  ['Avokado', 1.9, 6.7, 15, 2, 100],
  ['Losos', 0, 0, 13, 20, 150],
  ['Piletina, batak s kožom', 0, 0, 15, 17, 200],
  ['Junetina, mljevena (20 % masti)', 0, 0, 20, 17, 150],
  ['Svinjski vrat', 0, 0, 20, 17, 200],
  ['Sir gauda', 0, 0, 30, 25, 30],
  ['Slatko vrhnje 35 %', 3, 0, 35, 2.1, 50],
  ['Grčki jogurt 10 %', 3.5, 0, 10, 5, 150],
  ['Brokula', 4, 2.6, 0.4, 2.8, 150],
  ['Špinat', 1.4, 2.2, 0.4, 2.9, 100],
  ['Bademi', 9.1, 12.5, 50, 21, 30]
];
