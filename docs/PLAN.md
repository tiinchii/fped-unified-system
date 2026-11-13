# Plano (buod)

Tantiyang tagal: mga 15–16 linggo, isang developer.

**Kalagayan:** tapos na ang code ng Phase 1 (login, roles, users, audit log, menu, user import, deploy files),
Phase 2 (Travel Orders) at Phase 3 (Procurement). Hindi muna magde-deploy sa server: tatapusin muna ang lahat ng
features (Phase 4), saka ang staging deploy, import ng totoong data at users.

Natitira sa Phase 2 at 3:

- Listahan ng mga dokumento ng TO checklist: tapos na ang feature; ilalagay ng Admin ang mga dokumento sa
  Settings → TO checklist kapag buo na ang listahan.
- Paghahambing sa lumang system gamit ang totoong data (overlap check, incomplete PRs, budget totals): gagawin
  kasabay ng test import (Phase 5). Ang rules ay kinopya mula sa `legacy/apps-script/` at may tests sa
  `backend/src/test/.../travel` at `.../procurement`.
- Early procurement (hal. natanggap Nob 2026 para sa pondo ng 2027): may **Para sa taon (FY)** na sa proposal.
  Naka-default ito sa taon ng Date received, at babaguhin lang kapag early. Ang FY ang sinusunod ng listahan,
  ng budget na pagbabawasan ng PR, at ng ID (`PROC-2027-…`, `PR-2027-…`). Kapag binago ang FY, nagkakaroon ng ID ng
  bagong taon ang record at ang mga PR nito, at nakasulat sa Remarks ang dating ID. Sa import (Phase 5), ang FY ng
  lumang records ay ang taon ng Date received.
- Pagtutugma ng offices na iba ang baybay sa dalawang lumang system (hal. ADJU at ADJUDICATION, ENGR at ENGINEERING,
  LIB at LIBRARY): gagawin sa import (Phase 5).

| Phase | Gagawin | Tagal | Tapos kapag |
|---|---|---|---|
| 0 – Paghahanda | Sagutin ang open questions, hiling sa IT Dept, Google Cloud project, ihanda ang server | 1 linggo | May database at user na sa server; naipadala na ang mga hiling |
| 1 – Pundasyon | Spring Boot project, Flyway, login at roles, audit log, portal shell at menu, staging | 2 linggo | Makakapag-login sa staging gamit ang na-import na users |
| 2 – Travel Orders | Personnel, TO, overlap at duplicate checks, reschedule, cancel/restore, dashboard | 3 linggo | Pareho ang resulta ng overlap check sa lumang system |
| 3 – Procurement | Proposals, PRs, SPPMP, routing, budgets, repeat check, incomplete flags | 4 linggo | Pareho ang incomplete PRs at budget totals sa lumang system |
| 4 – Calendar | Google connection, shared calendar: month at week view, add/edit/delete | 1–2 linggo | Nasubukan sa totoong shared calendar |
| 5 – Import at testing | Test imports, paglinis ng data, parallel run | 2 linggo | Walang pagkakaiba sa bilang at totals |
| 6 – Go-live | Huling import, buksan sa labas, training, gawing archive ang Sheets | 1 linggo | Live na |

## Mga tanong

- [x] Angular o React ang frontend? **React + TypeScript**
- [x] Itutuloy ba ang TO document checklist? **Oo.** Wala pang listahan ng mga dokumento, kaya ang Admin ang
  maglalagay nito sa Settings. Iisang checklist bawat TO, makikita agad kung ano ang kulang kapag ibinalik.
- [ ] Gmail? **Pinag-iisipan pa** (baka delikado kung makompromiso ang account). Nasa menu pa rin ang Email para
  madaling idagdag sa susunod; Calendar lang muna ang gagawin sa Phase 4.
- [x] Primary o shared calendar? **Shared calendar** ng lahat ng sections (calendar ID ilalagay sa Settings).
- [x] Workspace super admin? **IT Dept.** Mukhang hindi naka-restrict ang Google Cloud console; kumpirmahin kapag
  ginagawa na ang OAuth app.
- [ ] Ilang tao ang magla-log in sa bagong system, at sino ang Admin (may access sa Users, Offices, Settings)?
- [x] Upload ng scanned na dokumento? **Hindi kailangan** (checklist at record lang).
- [x] Saan ang kopya ng backup sa labas ng server? **Google Drive.**
- [x] Iisang login para sa FIND at FAST? **Hindi na kailangan:** iisa na ang login ng FIND at FAST (nakabase sa FIND).

## Hihilingin sa IT Dept

- [ ] Subdomain na nakaturo sa public IP ng server
- [ ] Pagbukas ng port 443 (at 80 para sa redirect)
- [ ] SSL certificate
- [ ] Pahintulot sa Workspace admin (IT Dept) para sa OAuth app, kung kakailanganin
