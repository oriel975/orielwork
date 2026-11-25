// League catalogue. Each league names its data provider, the rating pool it is
// fitted in (pools link leagues through cross-competition games, e.g. Israeli
// clubs in European cups) and keys for the optional odds providers.

export const SPORTS = {
  soccer: { he: 'כדורגל', icon: '⚽', model: 'goals' },
  basketball: { he: 'כדורסל', icon: '🏀', model: 'points' },
  football: { he: 'פוטבול', icon: '🏈', model: 'points' },
  hockey: { he: 'הוקי קרח', icon: '🏒', model: 'goals' },
  baseball: { he: 'בייסבול', icon: '⚾', model: 'goals' },
  tennis: { he: 'טניס', icon: '🎾', model: 'tennis' },
};

const soccer = (key, he, country, extra = {}) => ({
  key, sport: 'soccer', he, country, provider: 'espn', espn: `soccer/${key}`, pool: 'soccer',
  // prevYear: last season's games (esp. European cups) link the leagues' strength scales.
  // Backtest 24.11: Brier skill +8.2% → +9.1%, UCL Brier 0.519 → 0.480.
  history: { mode: 'year', prevYear: true }, format: { periods: 2, periodMin: 45 }, ...extra,
});

export const LEAGUES = [
  // ---- Israel (TheSportsDB) ----
  { key: 'isr.1', sport: 'soccer', he: 'ליגת העל', country: 'ישראל', provider: 'tsdb', tsdbId: 4644, pool: 'soccer', featured: true, format: { periods: 2, periodMin: 45 }, apiFootball: 383 },
  { key: 'isr.2', sport: 'soccer', he: 'הליגה הלאומית', country: 'ישראל', provider: 'tsdb', tsdbId: 4966, pool: 'soccer', format: { periods: 2, periodMin: 45 }, apiFootball: 382 },
  // ---- European cups ----
  soccer('uefa.champions', 'ליגת האלופות', 'אירופה', { featured: true, odds: 'soccer_uefa_champs_league', apiFootball: 2 }),
  soccer('uefa.europa', 'הליגה האירופית', 'אירופה', { featured: true, odds: 'soccer_uefa_europa_league', apiFootball: 3 }),
  soccer('uefa.europa.conf', 'הקונפרנס ליג', 'אירופה', { featured: true, odds: 'soccer_uefa_europa_conference_league', apiFootball: 848 }),
  // ---- Top European leagues ----
  soccer('eng.1', 'פרמייר ליג', 'אנגליה', { featured: true, odds: 'soccer_epl', apiFootball: 39 }),
  soccer('esp.1', 'לה ליגה', 'ספרד', { featured: true, odds: 'soccer_spain_la_liga', apiFootball: 140 }),
  soccer('ita.1', 'סרייה A', 'איטליה', { featured: true, odds: 'soccer_italy_serie_a', apiFootball: 135 }),
  soccer('ger.1', 'בונדסליגה', 'גרמניה', { featured: true, odds: 'soccer_germany_bundesliga', apiFootball: 78 }),
  soccer('fra.1', 'ליג 1', 'צרפת', { featured: true, odds: 'soccer_france_ligue_one', apiFootball: 61 }),
  soccer('eng.2', "צ'מפיונשיפ", 'אנגליה', { odds: 'soccer_efl_champ', apiFootball: 40 }),
  soccer('ned.1', 'ארדיביזי', 'הולנד', { odds: 'soccer_netherlands_eredivisie', apiFootball: 88 }),
  soccer('por.1', 'ליגה פורטוגל', 'פורטוגל', { odds: 'soccer_portugal_primeira_liga', apiFootball: 94 }),
  soccer('tur.1', 'סופר ליג', 'טורקיה', { odds: 'soccer_turkey_super_league', apiFootball: 203 }),
  soccer('bel.1', 'ליגה בלגית', 'בלגיה', { odds: 'soccer_belgium_first_div', apiFootball: 144 }),
  soccer('sco.1', 'פרמייר סקוטית', 'סקוטלנד', { odds: 'soccer_spl', apiFootball: 179 }),
  soccer('gre.1', 'סופר ליג יוונית', 'יוון', { odds: 'soccer_greece_super_league', apiFootball: 197 }),
  soccer('aut.1', 'בונדסליגה אוסטרית', 'אוסטריה', { odds: 'soccer_austria_bundesliga', apiFootball: 218 }),
  soccer('den.1', 'סופרליגה דנית', 'דנמרק', { odds: 'soccer_denmark_superliga', apiFootball: 119 }),
  soccer('cyp.1', 'ליגה קפריסאית', 'קפריסין', { apiFootball: 318 }),
  // ---- National teams ----
  soccer('fifa.worldq.uefa', 'מוקדמות המונדיאל', 'נבחרות', { odds: 'soccer_fifa_world_cup_qualifiers_europe' }),
  soccer('uefa.nations', 'ליגת האומות', 'נבחרות', { odds: 'soccer_uefa_nations_league' }),
  soccer('fifa.friendly', 'משחקי ידידות', 'נבחרות', {}),
  // ---- Rest of the world ----
  soccer('ksa.1', 'ליגה סעודית', 'ערב הסעודית', { odds: 'soccer_saudi_arabia_pro_league', apiFootball: 307 }),
  soccer('usa.1', 'MLS', 'ארה"ב', { odds: 'soccer_usa_mls', apiFootball: 253 }),
  soccer('bra.1', 'ליגה ברזילאית', 'ברזיל', { odds: 'soccer_brazil_campeonato', apiFootball: 71 }),
  soccer('arg.1', 'ליגה ארגנטינאית', 'ארגנטינה', { odds: 'soccer_argentina_primera_division', apiFootball: 128 }),
  soccer('mex.1', 'ליגה מקסיקנית', 'מקסיקו', { odds: 'soccer_mexico_ligamx', apiFootball: 262 }),

  // ---- Basketball ----
  { key: 'isr.basket', sport: 'basketball', he: 'ליגת העל בכדורסל', country: 'ישראל', provider: 'tsdb', tsdbId: 4474, pool: 'eurobasket', featured: true, format: { periods: 4, periodMin: 10, otMin: 5 } },
  { key: 'euroleague', sport: 'basketball', he: 'יורוליג', country: 'אירופה', provider: 'tsdb', tsdbId: 4546, pool: 'eurobasket', featured: true, format: { periods: 4, periodMin: 10, otMin: 5 }, odds: 'basketball_euroleague' },
  { key: 'eurocup', sport: 'basketball', he: 'יורוקאפ', country: 'אירופה', provider: 'tsdb', tsdbId: 4547, pool: 'eurobasket', format: { periods: 4, periodMin: 10, otMin: 5 } },
  { key: 'bcl', sport: 'basketball', he: 'ליגת האלופות FIBA', country: 'אירופה', provider: 'tsdb', tsdbId: 4548, pool: 'eurobasket', format: { periods: 4, periodMin: 10, otMin: 5 } },
  { key: 'nba', sport: 'basketball', he: 'NBA', country: 'ארה"ב', provider: 'espn', espn: 'basketball/nba', pool: 'nba', featured: true, history: { mode: 'season-months', startMonth: 10 }, format: { periods: 4, periodMin: 12, otMin: 5 }, odds: 'basketball_nba' },
  { key: 'ncaab', sport: 'basketball', he: 'מכללות (NCAA)', country: 'ארה"ב', provider: 'espn', espn: 'basketball/mens-college-basketball', pool: 'ncaab', history: { mode: 'days', days: 40, params: 'groups=50' }, scoreboardParams: 'groups=50&limit=400', format: { periods: 2, periodMin: 20, otMin: 5 }, odds: 'basketball_ncaab' },

  // ---- American football ----
  { key: 'nfl', sport: 'football', he: 'NFL', country: 'ארה"ב', provider: 'espn', espn: 'football/nfl', pool: 'nfl', featured: true, history: { mode: 'year', prevYear: true }, format: { periods: 4, periodMin: 15, otMin: 10 }, odds: 'americanfootball_nfl' },
  { key: 'ncaaf', sport: 'football', he: 'פוטבול מכללות', country: 'ארה"ב', provider: 'espn', espn: 'football/college-football', pool: 'ncaaf', history: { mode: 'days', days: 100, params: 'groups=80' }, scoreboardParams: 'groups=80&limit=300', format: { periods: 4, periodMin: 15, otMin: 10 }, odds: 'americanfootball_ncaaf' },

  // ---- Ice hockey ----
  { key: 'nhl', sport: 'hockey', he: 'NHL', country: 'ארה"ב', provider: 'espn', espn: 'hockey/nhl', pool: 'nhl', featured: true, history: { mode: 'season-months', startMonth: 10 }, format: { periods: 3, periodMin: 20, otMin: 5 }, odds: 'icehockey_nhl' },

  // ---- Baseball ----
  { key: 'mlb', sport: 'baseball', he: 'MLB', country: 'ארה"ב', provider: 'espn', espn: 'baseball/mlb', pool: 'mlb', history: { mode: 'season-months', startMonth: 3, endMonth: 11 }, format: { periods: 9 }, odds: 'baseball_mlb' },

  // ---- Tennis ----
  { key: 'atp', sport: 'tennis', he: 'ATP', country: 'גברים', provider: 'espn', espn: 'tennis/atp', pool: null, featured: true, tour: 'atp' },
  { key: 'wta', sport: 'tennis', he: 'WTA', country: 'נשים', provider: 'espn', espn: 'tennis/wta', pool: null, featured: true, tour: 'wta' },
];

export const LEAGUE_BY_KEY = new Map(LEAGUES.map((l) => [l.key, l]));

// Pool definitions: which model and which tuning each rating pool uses.
export const POOLS = {
  // groupPrior: shrink teams toward their own league's level (better cross-league predictions).
  // priorGames 1, but 3 for the Israeli leagues (current-season-only feed). Backtest 25.11 (112d):
  // log loss 0.9863 -> 0.9834, European cups 0.904 -> 0.893.
  soccer: { model: 'goals', sport: 'soccer', halfLifeDays: 200, priorGames: 1, groupPrior: true, groupPriorGames: { 'isr.1': 3, 'isr.2': 3 } },
  nhl: { model: 'goals', sport: 'hockey', halfLifeDays: 150, priorGames: 6 },
  mlb: { model: 'goals', sport: 'baseball', halfLifeDays: 120, priorGames: 10 },
  nba: { model: 'points', sport: 'basketball', halfLifeDays: 90, ridgeGames: 4 },
  ncaab: { model: 'points', sport: 'basketball', halfLifeDays: 90, ridgeGames: 3 },
  eurobasket: { model: 'points', sport: 'basketball', halfLifeDays: 120, ridgeGames: 3 },
  nfl: { model: 'points', sport: 'football', halfLifeDays: 200, ridgeGames: 3 },
  ncaaf: { model: 'points', sport: 'football', halfLifeDays: 200, ridgeGames: 2 },
};

export function leaguesInPool(pool) {
  return LEAGUES.filter((l) => l.pool === pool);
}
