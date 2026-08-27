// GaPon — the trade-code item ledger.
//
// READ THIS BEFORE ADDING A COLLECTION.
//
// A trade code encodes a sticker as its INDEX in this list. That means the
// order here is a permanent contract with every code ever issued — including
// the ones sitting unopened in someone's chat right now.
//
// This list used to be computed as Object.keys(ITEMS_BY_ID).sort(), which was
// fine until sets started rotating: adding a collection re-sorted everything,
// silently shifting indices, and an unopened capsule would hand its owner a
// completely different sticker than it was sent as.
//
// So the order is frozen here instead. Two rules, no exceptions:
//
//   1. APPEND new ids to the END. Never insert, never sort, never remove.
//   2. Retiring a set from the machines does NOT remove it from this list.
//      Retired stickers still trade, and their old codes must still work.
//
// The pre-commit hook checks that every sticker in data.js appears here, so
// forgetting is caught before it can ship.

const TRADE_ID_LEDGER = [
  // critters
  'cr_bee',          // 0
  'cr_bug',          // 1
  'cr_bun',          // 2
  'cr_dashy',        // 3
  'cr_egg',          // 4
  'cr_fish',         // 5
  'cr_hive',         // 6
  'cr_hunt',         // 7
  'cr_leaf',         // 8
  'cr_mouse',        // 9
  'cr_paw',          // 10
  'cr_raven',        // 11

  // garden
  'gd_bloom',        // 12
  'gd_compost',      // 13
  'gd_farm',         // 14
  'gd_forest',       // 15
  'gd_grass',        // 16
  'gd_hug',          // 17
  'gd_park',         // 18
  'gd_pot',          // 19
  'gd_rose',         // 20
  'gd_sprout',       // 21
  'gd_tree',         // 22
  'gd_yard',         // 23

  // music
  'mu_album',        // 24
  'mu_eq',           // 25
  'mu_lib',          // 26
  'mu_mega',         // 27
  'mu_mic',          // 28
  'mu_note',         // 29
  'mu_phones',       // 30
  'mu_piano',        // 31
  'mu_queue',        // 32
  'mu_radio',        // 33
  'mu_speaker',      // 34
  'mu_vol',          // 35

  // ocean
  'oc_anchor',       // 36
  'oc_boat',         // 37
  'oc_brella',       // 38
  'oc_drip',         // 39
  'oc_house',        // 40
  'oc_kayak',        // 41
  'oc_pool',         // 42
  'oc_sail',         // 43
  'oc_scuba',        // 44
  'oc_surf',         // 45
  'oc_tsunami',      // 46
  'oc_wave',         // 47

  // retro
  'px_board',        // 48
  'px_cable',        // 49
  'px_cart',         // 50
  'px_chip',         // 51
  'px_keys',         // 52
  'px_mouse',        // 53
  'px_pad',          // 54
  'px_ram',          // 55
  'px_save',         // 56
  'px_stick',        // 57
  'px_term',         // 58
  'px_token',        // 59

  // roadtrip
  'rt_bag',          // 60
  'rt_bus',          // 61
  'rt_car',          // 62
  'rt_gas',          // 63
  'rt_map',          // 64
  'rt_moto',         // 65
  'rt_sign',         // 66
  'rt_snack',        // 67
  'rt_tent',         // 68
  'rt_view',         // 69
  'rt_wheel',        // 70
  'rt_world',        // 71

  // sports
  'sb_base',         // 72
  'sb_finish',       // 73
  'sb_foot',         // 74
  'sb_golf',         // 75
  'sb_hockey',       // 76
  'sb_hoop',         // 77
  'sb_karate',       // 78
  'sb_medal',        // 79
  'sb_skate',        // 80
  'sb_soccer',       // 81
  'sb_trophy',       // 82
  'sb_volley',       // 83

  // snacks
  'sn_cake',         // 84
  'sn_coffee',       // 85
  'sn_cookie',       // 86
  'sn_crois',        // 87
  'sn_donut',        // 88
  'sn_egg',          // 89
  'sn_ice',          // 90
  'sn_party',        // 91
  'sn_pizza',        // 92
  'sn_ramen',        // 93
  'sn_tapas',        // 94
  'sn_tea',          // 95

  // space
  'sp_flare',        // 96
  'sp_launch',       // 97
  'sp_moon',         // 98
  'sp_night',        // 99
  'sp_nova',         // 100
  'sp_planet',       // 101
  'sp_robo',         // 102
  'sp_rocket',       // 103
  'sp_sat',          // 104
  'sp_spark',        // 105
  'sp_star',         // 106
  'sp_sun',          // 107

  // weather
  'wx_bolt',         // 108
  'wx_cloud',        // 109
  'wx_cyclone',      // 110
  'wx_drop',         // 111
  'wx_dusk',         // 112
  'wx_fog',          // 113
  'wx_rain',         // 114
  'wx_rainbow',      // 115
  'wx_snow',         // 116
  'wx_storm',        // 117
  'wx_thunder',      // 118
  'wx_wind',         // 119

  // cat cafe — appended Aug 27 2026. APPEND ONLY: a trade code encodes the
  // INDEX into this list, so inserting or re-sorting silently re-points every
  // unopened capsule in the wild.
  'ct_box',          // 120
  'ct_kitten',       // 121
  'ct_latte',        // 122
  'ct_loaf',         // 123
  'ct_maneki',       // 124
  'ct_milk',         // 125
  'ct_mouse',        // 126
  'ct_nap',          // 127
  'ct_paw',          // 128
  'ct_tuxedo',       // 129
  'ct_window',       // 130
  'ct_zoom',         // 131
];
