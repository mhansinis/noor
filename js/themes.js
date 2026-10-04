// Fixed catalogue of themes the app can recognise, and the fixed templates
// used to build a package from them. Nothing here is generated: every word a
// package can contain is written in this file.
//
// For each theme:
//   label    Plain-English name shown to her.
//   anchors  Example sentences (English). A review joins the theme when its
//            embedding is close enough to one of these, in any language the
//            model knows.
//   kind     'want'     something guests valued or asked for; can become a package step
//            'issue'    a problem; can become a package step that fixes it
//            'strength' praise; shown, but nothing to build
//   caps     Capability ids (from profile.js) that can deliver this step, in
//            order of preference. Only ones marked Yes or With effort are used.
//   need     What delivering it takes, in plain words. Used to match her own
//            added items, and to say what is missing.
//   step     The package step, exactly as shown.
//   title    Short name used in the package name.
const THEMES = [
  {
    id: 'roasting',
    label: 'Enjoyed watching the roasting',
    kind: 'want',
    anchors: [
      'Watching the coffee beans being roasted',
      'The roasting over the fire was the highlight',
      'We loved seeing the coffee roasted by hand',
    ],
    caps: ['hand-roaster'],
    need: 'Roasting coffee beans by hand',
    step: 'Roast a batch of coffee over the fire while guests watch.',
    title: 'a roasting demonstration',
  },
  {
    id: 'tasting',
    label: 'Wanted to taste the coffee',
    kind: 'want',
    anchors: [
      'We wish we could taste the coffee at the end',
      'I would like to drink a cup of the coffee after the tour',
      'Please add a coffee tasting',
    ],
    caps: ['grind-brew'],
    need: 'Brewing coffee for guests to taste',
    step: 'Finish with a tasting: brew your coffee and let guests try it.',
    title: 'a coffee tasting',
  },
  {
    id: 'buy',
    label: 'Wanted to buy coffee to take home',
    kind: 'want',
    anchors: ['We wanted to buy coffee to take home', 'I wish I could buy roasted coffee beans'],
    caps: ['beans-to-sell'],
    need: 'Roasted coffee for guests to buy',
    step: 'Offer bags of your roasted coffee for guests to buy.',
    title: 'coffee to take home',
  },
  {
    id: 'picking',
    label: 'Enjoyed picking coffee cherries',
    kind: 'want',
    anchors: ['Picking ripe coffee cherries', 'The children enjoyed picking coffee cherries'],
    caps: ['coffee-picking'],
    need: 'Coffee cherries guests can pick',
    step: 'Let guests pick ripe coffee cherries (in season).',
    title: 'cherry picking',
  },
  {
    id: 'food',
    label: 'Enjoyed the food',
    kind: 'want',
    anchors: ['The home cooked lunch was delicious', 'The food was very tasty'],
    caps: ['rice-curry', 'outdoor-kitchen'],
    need: 'Cooking a meal for guests',
    step: 'Serve a home-cooked lunch.',
    title: 'a home-cooked lunch',
  },
  {
    id: 'spices',
    label: 'Interested in the spices',
    kind: 'want',
    anchors: ['Learning about spices like cinnamon and pepper', 'I wanted to learn more about the spice plants'],
    caps: ['spice-plants'],
    need: 'Spice plants such as cinnamon and pepper',
    step: 'Show guests the spice plants and how they are used.',
    title: 'a spice garden walk',
  },
  {
    id: 'steep',
    label: 'Found the walk too steep',
    kind: 'issue',
    anchors: ['The path is very steep', 'The walk was hard and steep, difficult for older people', 'The hill path is steep and slippery'],
    caps: ['transport'],
    need: 'A vehicle to drive guests up the hill',
    step: 'Offer a lift for the steep part of the walk.',
    title: 'a lift up the hill',
  },
  {
    id: 'directions',
    label: 'Had trouble finding the farm',
    kind: 'issue',
    anchors: ['The farm was hard to find', 'Please put up a sign on the road'],
    caps: ['station-pickup', 'transport'],
    need: 'Picking guests up and bringing them to the farm',
    step: 'Pick guests up so they do not have to find the farm.',
    title: 'pick-up',
  },
  {
    id: 'rain',
    label: 'Rain during the visit',
    kind: 'issue',
    anchors: ['It rained during the tour', 'They gave us umbrellas when it rained'],
    caps: ['rain-shelter'],
    need: 'A covered place to shelter from rain',
    step: 'Keep the covered space ready in case of rain.',
    title: 'a rain shelter',
  },
  {
    id: 'payment',
    label: 'Wanted to pay by card',
    kind: 'issue',
    anchors: ['Please accept card payment', 'We needed cash'],
    caps: [],
    need: 'Taking card payments',
    step: 'Accept card payments.',
    title: 'card payment',
  },
  {
    id: 'leeches',
    label: 'Leeches on the walk',
    kind: 'issue',
    anchors: ['There were leeches on the walk'],
    caps: [],
    need: 'Leech socks or salt for guests',
    step: 'Give guests leech socks or salt before the walk.',
    title: 'leech protection',
  },
  {
    id: 'welcome',
    label: 'Felt welcome',
    kind: 'strength',
    anchors: ['A warm welcome from a very friendly family', 'Kind and welcoming hosts'],
  },
  {
    id: 'nature',
    label: 'Liked the views and nature',
    kind: 'strength',
    anchors: ['Beautiful views of the mountains', 'Peaceful nature with birds and animals'],
  },
];
