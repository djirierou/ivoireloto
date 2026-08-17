export const CONFIG = {
  VERSION: '2.1.0',
  DB_NAME: 'loto-bonheur-v2',
  STORE_DRAWS: 'draws',
  STORE_LOGS: 'logs',
  STORE_CFG: 'config',
  LS_FALLBACK: {
    draws: 'lb_draws_v3',
    logs: 'lb_logs_v3',
    cfg: 'lb_cfg_v3',
  },
  MAX_TICKET_COMBOS: 20000,
  MAX_TICKET_PREVIEW: 40,
  DEFAULT_HOT: 15,
  DEFAULT_COLD: 15,
  SESSION_LIST: [
    'Special Weekend 1h','Special Weekend 3h','Digital Reveil 7h','Digital Reveil 8h',
    'Digital 21h','Digital 22h','Digital 23h','Soutra','Diamant','Moaye',
    'Afterwork','National','Benediction','Prestige','Awale','Espoir','Midi','Soir','Special'
  ],
  DATA_URL: '/data/real_data.json',
  PROXY_ENDPOINTS: [
    '/lonaci-proxy', // Vite dev proxy
    '/api/lonaci',   // serverless
    'https://api.allorigins.win/raw?url=https://lotobonheur.ci/resultats', // public CORS proxy fallback (best effort)
  ]
};

// Données d'exemple fallback (si fetch JSON échoue) — 26 tirages
export const REAL_DATA_FALLBACK = [
  ['2026-08-01','Special Weekend 1h','42 2 31 74 25','69 46 66 32 30'],
  ['2026-08-01','Special Weekend 3h','11 37 4 33 6','76 78 19 36 59'],
  ['2026-08-01','Digital Reveil 7h','89 76 29 83 68','41 25 72 43 40'],
  ['2026-08-01','Digital Reveil 8h','79 41 60 64 55','8 35 81 28 20'],
  ['2026-08-01','Digital 21h','16 79 40 4 18','69 82 65 67 7'],
  ['2026-08-01','Digital 22h','80 22 82 54 31','18 58 69 44 20'],
  ['2026-08-01','Digital 23h','35 80 32 18 51','60 57 53 44 3'],
  ['2026-08-01','Soutra','61 19 39 81 4','50 6 85 59 73'],
  ['2026-08-01','Diamant','83 82 28 51 76','84 68 55 29 14'],
  ['2026-08-01','Moaye','66 39 62 13 8','71 70 64 33 14'],
  ['2026-08-01','Afterwork','56 26 60 52 27','64 7 73 35 25'],
  ['2026-08-01','National','63 12 34 41 82',''],
  ['2026-08-02','Special Weekend 1h','49 18 1 36 31','29 73 40 8 9'],
  ['2026-08-02','Special Weekend 3h','8 32 16 90 70','25 26 86 83 22'],
  ['2026-08-02','Digital Reveil 7h','49 87 9 55 47','17 39 51 48 29'],
  ['2026-08-02','Digital Reveil 8h','18 3 57 19 41','89 28 58 25 13'],
  ['2026-08-02','Digital 21h','80 16 65 85 21','43 4 81 77 88'],
  ['2026-08-02','Digital 22h','65 31 56 82 21','14 75 51 15 53'],
  ['2026-08-02','Digital 23h','47 34 90 35 51','83 86 42 58 38'],
  ['2026-08-02','Benediction','68 34 63 33 55','66 52 78 16 62'],
  ['2026-08-02','Prestige','4 36 78 34 68','17 86 53 52 8'],
  ['2026-08-02','Awale','51 32 15 86 46','35 1 3 57 33'],
  ['2026-08-02','Afterwork','4 24 1 16 65','76 13 56 60 78'],
  ['2026-08-02','Espoir','90 83 21 43 68','1 46 7 4 3'],
  ['2026-08-16','Special Weekend 1h','62 9 52 70 63','48 38 77 67 34'],
  ['2026-08-16','Special Weekend 3h','39 71 25 72 90','24 49 51 41 83']
];
