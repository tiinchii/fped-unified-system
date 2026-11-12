# Plano (buod)

Tantiyang tagal: mga 15–16 linggo, isang developer.

**Kalagayan:** tapos na ang code ng Phase 1 (login, roles, users, audit log, menu, user import, deploy files),
Phase 2 (Travel Orders) at Phase 3 (Procurement). Hindi muna magde-deploy sa server: tatapusin muna ang lahat ng
features (Phase 4), saka ang staging deploy, import ng totoong data at users.

Natitira sa Phase 2 at 3:

- Document checklist ng TO: hinihintay ang sagot sa tanong sa ibaba (itutuloy ba, at anong mga dokumento).
- Paghahambing sa lumang system gamit ang totoong data (overlap check, incomplete PRs, budget totals): gagawin
  kasabay ng test import (Phase 5). Ang rules ay kinopya mula sa `legacy/apps-script/` at may tests sa
  `backend/src/test/.../travel` at `.../procurement`.
- Pagtutugma ng offices na iba ang baybay sa dalawang lumang system (hal. ADJU at ADJUDICATION, ENGR at ENGINEERING,
  LIB at LIBRARY): gagawin sa import (Phase 5).

| Phase | Gagawin | Tagal | Tapos kapag |
|---|---|---|---|
| 0 – Paghahanda | Sagutin ang open questions, hiling sa IT Dept, Google Cloud project, ihanda ang server | 1 linggo | May database at user na sa server; naipadala na ang mga hiling |
| 1 – Pundasyon | Spring Boot project, Flyway, login at roles, audit log, portal shell at menu, staging | 2 linggo | Makakapag-login sa staging gamit ang na-import na users |
| 2 – Travel Orders | Personnel, TO, overlap at duplicate checks, reschedule, cancel/restore, dashboard | 3 linggo | Pareho ang resulta ng overlap check sa lumang system |
| 3 – Procurement | Proposals, PRs, SPPMP, routing, budgets, repeat check, incomplete flags | 4 linggo | Pareho ang incomplete PRs at budget totals sa lumang system |
| 4 – Gmail at Calendar | Google connection, inbox, labels, print, calendar, "Gawing event" | 2–3 linggo | Nasubukan sa totoong office account |
| 5 – Import at testing | Test imports, paglinis ng data, parallel run | 2 linggo | Walang pagkakaiba sa bilang at totals |
| 6 – Go-live | Huling import, buksan sa labas, training, gawing archive ang Sheets | 1 linggo | Live na |

## Mga tanong na hindi pa nasasagot

- [x] Angular o React ang frontend? **React + TypeScript**
- [ ] Itutuloy ba ang TO document checklist? Anong mga dokumento?
- [ ] Office Gmail address; primary calendar ba o shared calendar?
- [ ] Sino ang Workspace super admin; naka-restrict ba ang third-party apps?
- [ ] Ilan ang users, at sino ang Admin?
- [ ] Kailangan bang mag-upload ng scanned na dokumento?
- [ ] Saan ilalagay ang kopya ng backup sa labas ng server?
- [ ] Isasama ba sa susunod na phase ang iisang login para sa FIND at FAST?

## Hihilingin sa IT Dept

- [ ] Subdomain na nakaturo sa public IP ng server
- [ ] Pagbukas ng port 443 (at 80 para sa redirect)
- [ ] SSL certificate
- [ ] Pahintulot sa Workspace admin para sa OAuth app (kung restricted)
