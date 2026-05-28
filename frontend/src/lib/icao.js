// ICAO airline designator → display name. Subset of European/intercontinental
// carriers we expect to see most often. Unknown codes show the raw 3-letter prefix.
export const AIRLINES = {
  AFR: "Air France", AEA: "Air Europa", AUA: "Austrian", AZA: "ITA Airways",
  BAW: "British Airways", BEL: "Brussels Airlines", BTI: "airBaltic",
  CFG: "Condor", CSA: "ČSA", DLH: "Lufthansa", EIN: "Aer Lingus",
  EJU: "easyJet Europe", EZS: "easyJet Switzerland", EZY: "easyJet UK",
  FIN: "Finnair", IBE: "Iberia", IBK: "Iberia Express", KLM: "KLM",
  LDA: "Lauda Europe", LOT: "LOT Polish", NAX: "Norwegian",
  NOZ: "Norwegian Air Sweden", NSZ: "Norwegian Air Norway",
  PGT: "Pegasus", QTR: "Qatar Airways",
  RYR: "Ryanair", RUK: "Ryanair UK", RAM: "Royal Air Maroc",
  SAS: "SAS", SWR: "SWISS", TAP: "TAP Portugal", THY: "Turkish Airlines",
  TRA: "Transavia", TVF: "Transavia France", VLG: "Vueling", VOE: "Volotea",
  WUK: "Wizz Air UK", WZZ: "Wizz Air", AAL: "American", DAL: "Delta",
  UAL: "United", ACA: "Air Canada", AFL: "Aeroflot", ETD: "Etihad",
  UAE: "Emirates", SVA: "Saudia", MEA: "Middle East Airlines",
  GEC: "Lufthansa Cargo", FDX: "FedEx", UPS: "UPS",
  BCS: "European Air Transport", NJU: "NetJets Europe", NATO: "NATO",
};

export const AIRPORTS = {
  LFPG: "Paris CDG", LFPO: "Paris Orly", LFBO: "Toulouse", LFML: "Marseille",
  LFLL: "Lyon", LFMN: "Nice", LFSB: "Basel-Mulhouse", LFRS: "Nantes",
  EGLL: "London Heathrow", EGKK: "London Gatwick", EGSS: "London Stansted",
  EGLC: "London City", EGGW: "London Luton", EGCC: "Manchester",
  EGPH: "Edinburgh", EGGD: "Bristol", EIDW: "Dublin",
  EDDF: "Frankfurt", EDDM: "Munich", EDDB: "Berlin", EDDH: "Hamburg",
  EDDL: "Düsseldorf", EDDS: "Stuttgart", EDDK: "Köln-Bonn",
  LSGG: "Geneva", LSZH: "Zurich", LOWW: "Vienna",
  EHAM: "Amsterdam", EBBR: "Brussels", ELLX: "Luxembourg",
  LEMD: "Madrid", LEBL: "Barcelona", LEPA: "Palma", LEMG: "Málaga",
  LEAL: "Alicante", LEVC: "Valencia", LEBB: "Bilbao", LEZL: "Seville",
  LIRF: "Rome FCO", LIMC: "Milan MXP", LIML: "Milan LIN", LIPZ: "Venice",
  LIPE: "Bologna", LICC: "Catania", LIRN: "Naples",
  LPPT: "Lisbon", LPPR: "Porto", LPFR: "Faro",
  LTBA: "Istanbul IST", LTFM: "Istanbul SAW", LTFJ: "Istanbul SAW",
  EPWA: "Warsaw", EPKK: "Kraków", EKCH: "Copenhagen", ESSA: "Stockholm",
  ENGM: "Oslo", EFHK: "Helsinki", BIKF: "Reykjavik",
  LGAV: "Athens", LBSF: "Sofia", LROP: "Bucharest", LHBP: "Budapest",
  LKPR: "Prague", LZIB: "Bratislava", LJLJ: "Ljubljana", LDZA: "Zagreb",
  LMML: "Malta", LCLK: "Larnaca", LYBE: "Belgrade",
  KJFK: "New York JFK", KLAX: "Los Angeles", KORD: "Chicago", KIAD: "Washington",
  KMIA: "Miami", KBOS: "Boston",
  OMDB: "Dubai", OTHH: "Doha",
};

export const AIRCRAFT_TYPES = {
  A19N: "A319neo", A20N: "A320neo", A21N: "A321neo",
  A318: "A318", A319: "A319", A320: "A320", A321: "A321",
  A332: "A330-200", A333: "A330-300", A338: "A330-800neo", A339: "A330-900neo",
  A342: "A340-200", A343: "A340-300", A345: "A340-500", A346: "A340-600",
  A359: "A350-900", A35K: "A350-1000", A388: "A380-800",
  B712: "717", B732: "737-200", B733: "737-300", B734: "737-400", B735: "737-500",
  B736: "737-600", B737: "737-700", B738: "737-800", B739: "737-900",
  B37M: "737 MAX 7", B38M: "737 MAX 8", B39M: "737 MAX 9", B3XM: "737 MAX 10",
  B742: "747-200", B744: "747-400", B748: "747-8",
  B752: "757-200", B753: "757-300", B762: "767-200", B763: "767-300", B764: "767-400",
  B772: "777-200", B77L: "777-200LR", B773: "777-300", B77W: "777-300ER",
  B778: "777-8", B779: "777-9",
  B788: "787-8", B789: "787-9", B78X: "787-10",
  BCS1: "A220-100", BCS3: "A220-300",
  E170: "E170", E175: "E175", E190: "E190", E195: "E195",
  E290: "E2-190", E295: "E2-195",
  CRJ7: "CRJ-700", CRJ9: "CRJ-900", CRJX: "CRJ-1000",
  AT72: "ATR 72", AT76: "ATR 72-600", AT43: "ATR 42", AT46: "ATR 42-600",
  DH8D: "Dash 8 Q400",
  GLF5: "Gulfstream G550", GLF6: "Gulfstream G650", G280: "Gulfstream G280",
  GLEX: "Bombardier Global", GL7T: "Global 7500",
  CL30: "Challenger 300", CL35: "Challenger 350", CL60: "Challenger 600",
  C56X: "Citation Excel", C68A: "Citation Latitude", C700: "Citation Longitude",
  FA7X: "Falcon 7X", FA8X: "Falcon 8X", F900: "Falcon 900",
  E545: "Legacy 450", E550: "Legacy 500",
  PC12: "Pilatus PC-12", PC24: "Pilatus PC-24",
};

export const callsignToAirline = (cs) =>
  ((cs || "").trim().slice(0, 3) || "").toUpperCase();

export const airlineLabel = (code) => AIRLINES[code] || code;
export const airportLabel = (code) =>
  code && AIRPORTS[code] ? `${AIRPORTS[code]} (${code})` : code;
export const aircraftLabel = (code) =>
  code ? AIRCRAFT_TYPES[code] || code : code;
