// ============================================================
// EXAMPLE DATA ONLY. These are made-up reviews for testing,
// not real guest feedback. They are loaded only when she taps
// "Load example reviews", and are tagged so they can be removed.
//
// 43 reviews: 19 English, 9 German, 10 French, 5 Sinhala.
// Groups, chosen so different farm answers lead to different packages:
//   watching the roasting (10, the largest) -> hand roaster
//   wanting to taste the coffee (6)      -> brewing gear
//   wanting to buy coffee to take home (6) -> roasted coffee to sell
//   enjoying the home-cooked lunch (5)   -> rice and curry / outdoor kitchen
//   steep walk (4), varied (12)
// The Sinhala ones are set aside by the app (see feedback.js).
// ============================================================
const EXAMPLE_REVIEWS = [
  // Watching the roasting
  'Watching her roast the beans in a clay pot over the fire was the best part of our trip.',
  'Loved the roasting. You could smell it from the garden.',
  'The smell of the beans roasting in the pan was unforgettable.',
  'Seeing the coffee roasted by hand over the fire was fascinating.',
  'Our favourite part was the roasting demonstration.',
  'Es war faszinierend zuzusehen, wie die Bohnen über dem Feuer geröstet wurden. Dieser Duft!',
  'Das Rösten in der Pfanne zu sehen war das Highlight unserer Reise.',
  'Voir la torréfaction à la main, c’était magique.',
  'On a adoré voir griller le café sur le feu de bois.',
  'කෝපි බෝංචි බදින හැටි බලන්න ලැබුණු එක ගොඩක් සතුටක්.',

  // Wishing they could taste the coffee afterwards
  'Wish we could have tasted the coffee we roasted at the end!',
  'Great tour, but we left without a single cup of coffee. Would pay extra for a tasting.',
  'Would love to sit down and drink the coffee afterwards, with that view.',
  'Schade, dass wir den Kaffee am Ende nicht probieren konnten.',
  'Dommage de ne pas avoir pu goûter le café après la visite !',
  'අන්තිමට කෝපි කෝප්පයක් බොන්න ලැබුණා නම් හොඳයි.',

  // Wanting to buy coffee to take home
  'I wanted to buy beans to take home for my family, but there was nothing to buy.',
  'Is there a shop? We wanted packets of your beans to take home as gifts.',
  'Ich hätte gern frisch gerösteten Kaffee gekauft, aber es gab keinen zu kaufen.',
  'Wir wollten Kaffeebohnen kaufen und mit nach Hause nehmen.',
  'J’aurais voulu acheter un paquet de grains pour ramener à la maison.',
  'Nous voulions acheter des sachets de café en souvenir.',

  // Enjoying the home-cooked lunch
  'The home cooked lunch was delicious, especially the dhal.',
  'Best rice and curry we had in Sri Lanka, cooked by the family.',
  'Das hausgemachte Mittagessen war köstlich.',
  'Accueil chaleureux, et le rice and curry du déjeuner était délicieux.',
  'Le repas fait maison était excellent, avec des légumes du jardin.',

  // Steep walk
  'The path down to the coffee trees is steep. My mum struggled on the way back up.',
  'Der Weg zur Plantage ist ziemlich steil, gute Schuhe sind ein Muss.',
  'Le chemin est très raide, surtout après la pluie. Attention aux glissades.',
  'කන්ද නගින පාර ගොඩක් බෑවුම්, වයසක අයට අමාරුයි.',

  // Varied
  'Our tuk-tuk driver had trouble finding the farm. Maybe a sign on the main road?',
  'Such a peaceful place. We saw a giant squirrel and lots of birds.',
  'The kids loved picking the red coffee cherries.',
  'Would be great if you took card payment. We had to go back to town for cash.',
  'Started raining halfway through but they had umbrellas ready for us.',
  'The cinnamon peeling demo was a surprise highlight.',
  'Sehr herzliche Familie, wir haben uns sofort willkommen gefühlt.',
  'Die Aussicht über die Berge war atemberaubend.',
  'Nous aurions aimé plus d’explications sur la culture du poivre.',
  'Il y avait beaucoup de sangsues pendant la balade, prévoyez du sel !',
  'ගෙදර හදපු කෑම හරිම රසයි, හැමෝම හොඳට සැලකුවා.',
  'ළමයින්ට කෝපි ගෙඩි කඩන්න ලැබුණු එකට ගොඩක් ආසයි.',
];
