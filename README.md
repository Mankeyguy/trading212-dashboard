# Trading 212 Dashboard

Lokální finanční dashboard nad [Trading 212 Public API](https://docs.trading212.com/api) (v0).

| Záložka | Co ukazuje | Endpoint |
|---|---|---|
| **Přehled** | hodnota účtu, investice, nerealizovaný/realizovaný zisk, hotovost, dividendy, vklady vs. hodnota, alokace, největší zisky/ztráty | `/equity/account/summary`, `/equity/positions` + historie |
| **Pozice** | tabulka otevřených pozic (řazení, hledání), vliv měn, expozice podle měny | `/equity/positions` |
| **Dividendy** | po měsících / letech, kdo platí nejvíc, všechny výplaty | `/equity/history/dividends` |
| **Vklady a výběry** | vklady, výběry, poplatky po měsících + seznam | `/equity/history/transactions` |
| **Objednávky** | historie obchodů, filtry, poplatky, realizovaný zisk | `/equity/history/orders` |
| **Pies** | výsledek, cíl, složení (cíl vs. skutečnost) | `/equity/pies`, `/equity/pies/{id}` |

## Jak to funguje

```
prohlížeč ──► Vite (5173) ──/api──► Node server (127.0.0.1:3212) ──► live.trading212.com/api/v0
                                         │
                                         └─ data/<env>/history-*.json  (lokální cache historie)
```

- **API klíč zůstává jen na serveru** (soubor `.env`), do prohlížeče se nikdy nedostane. Server poslouchá jen na `127.0.0.1`.
- **Rate limity:** Trading 212 má přísné limity (např. historie 6 dotazů/min po max. 50 položkách, souhrn účtu 1 dotaz / 5 s). Server dotazy řadí do front a krátce je cachuje.
- **Historie** se při prvním spuštění stahuje postupně (u velkého účtu i několik minut) a ukládá se do `data/`. Další synchronizace (každých 30 min nebo tlačítkem) stahuje už jen nové záznamy. Přerušené stahování naváže tam, kde skončilo.

## Spuštění

Potřebuješ **Node.js 22+**.

```bash
cd trading212-dashboard
npm install
cp .env.example .env      # a doplň klíč
npm run dev               # http://127.0.0.1:5173
```

### API klíč

Trading 212 → **Settings → API (Beta) → Generate API key**

- Stačí oprávnění jen pro čtení: *Account data, Portfolio, History (orders, dividends, transactions), Pies read*. Obchodní oprávnění (orders execute) **nezapínej**, dashboard je nepotřebuje.
- Nové klíče mají **API Key + API Secret**: vyplň obě hodnoty (server použije HTTP Basic auth). Starší klíče secret nemají: vyplň jen `T212_API_KEY`.
- Doporučeno: v nastavení klíče omez přístup na svou IP adresu.

```ini
T212_API_KEY=...
T212_API_SECRET=...
T212_ENV=live
```

### Další příkazy

| Příkaz | Účel |
|---|---|
| `npm run dev:mock` | dashboard s **ukázkovými daty** bez API klíče |
| `npm run build && npm start` | produkční režim: jeden server na http://127.0.0.1:3212 |
| `npm run typecheck` | kontrola TypeScriptu |

Smazáním složky `data/` (nebo tlačítkem *Synchronizovat*) vynutíš nové stažení historie.

## Poznámky k datům

- Všechny hodnoty v **měně účtu** (zisk/ztráta, hodnota) bere dashboard přímo z API (`walletImpact`). Ceny v tabulce pozic jsou v měně instrumentu.
- *Celková hodnota vs. vklady* = hodnota účtu − (vklady − výběry). Zobrazí se, až je stažená celá historie transakcí.
- API neposkytuje historický vývoj hodnoty portfolia, proto graf ukazuje kumulativní vklady proti dnešní hodnotě.
- Pies API je Trading 212 označené jako *deprecated*. Pokud ho vypnou, záložka Pies přestane fungovat, zbytek dashboardu ne.

## Struktura

```
server/index.ts        Express API + cache + servírování buildu
server/t212.ts         klient Trading 212 (auth, rate limit, retry na 429)
server/historySync.ts  inkrementální stahování historie do data/
server/mock.ts         falešné API pro T212_MOCK=1
shared/types.ts        typy odpovědí API
src/                   React frontend (Recharts)
```
