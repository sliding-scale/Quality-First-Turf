# Mockups (throwaway, plain HTML/CSS/JS)

Open `index.html` in a browser. No build step, no server. Sample data only; every name and address is invented.

| Page | File |
|------|------|
| Home | `index.html` |
| Clients list (search, filters, sorting, pagination, CSV export) | `clients.html` |
| Client page (Client information, Activity; related projects, visits, notes) | `client.html?id=1001` |
| New client, and edit via `client-new.html?edit=1001` | `client-new.html` |

New and edited clients are kept in this browser's localStorage so the flow can be tried end to end.

Shared code: `assets/styles.css` (colours sampled from Jobber, Inter + Figtree fonts), `assets/app.js` (sidebar, top bar, menus), `assets/icons.js` (Jobber's Atlantis icons, MIT, see `assets/ICONS-LICENSE.txt`), `assets/data.js` (14 hand-written dummy clients plus 84 generated ones).

Only features from the PRD are included (D-024), plus the Jobber items the user chose to keep (D-025).

These are for review only. Once approved they are converted to Next.js (decision D-023); they are not the production code.
