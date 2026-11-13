# Procurement System — Setup

(Dating "Activity Proposal System".) Hiwalay na app ito sa Travel Order System: sariling Google Sheet, puwedeng parehong login. Para sa lahat ng taon.

## Update: Para sa taon (FY) / early procurement (Nob 2026)
Para sa sistemang tumatakbo na ngayon:
1. Sa Apps Script: palitan ang buong laman ng `Code.gs` at `Index` ng bagong **Code.gs** at **Index.html** → **Save**.
2. I-refresh ang Google Sheet → **Procurement System → 1. Setup sheets + admin login** (isang beses lang). Idadagdag nito
   ang column na `Fiscal Year` sa dulo ng `Procurements`. Walang nabubura; hindi na itatanong ulit ang logins o admin.
   (Kahit makalimutan ito, kusang nadadagdag ang column sa unang save; ang Setup lang ang naglalagay ng header nang sigurado.)
3. **Deploy → Manage deployments → ✏ → Version: New version → Deploy** (para hindi magbago ang link).

Walang kailangang baguhin sa lumang rows: kapag blangko ang `Fiscal Year`, ang taon ng *Date received* ang ginagamit
(pareho ng dati). Tingnan ang **Para sa taon (FY)** sa ibaba.

Kasama rin sa update na ito ang mas mabilis na pag-save (mas kaunting pagbasa sa sheets):

| Save | Dati | Ngayon |
|---|---|---|
| Edit ng proposal | 9 na tawag sa sheets | 3 |
| PR (bago o edit) | 7 | 5 |
| SPPMP | 12 | 9 |
| Routing (add / remove) | 8 / 11 | 4 / 5 |

Para makita kung gaano katagal ang bawat save: Apps Script → **Executions** → buksan ang `saveProposal` o `savePR`;
may log na hal. `savePR 1840 ms`. Kung mabagal pa rin minsan, kadalasan ito ay (1) ang unang tawag pagkatapos ng
matagal na walang gumagamit (pinapagising ng Google ang script, 2–5 segundo), o (2) may ibang nagse-save nang sabay
(naghihintay ang isa hanggang matapos ang isa pa).

## Kung naka-setup na ang lumang Activity Proposal System (update)
1. Sa Apps Script ng parehong Google Sheet: palitan ang laman ng `Code.gs` at `Index` ng bagong **Code.gs** at **Index.html** → **Save**.
2. I-refresh ang Google Sheet. Ang menu ay **Procurement System** na.
3. **Procurement System → 1. Setup sheets + admin login**
   - Gagawa ng bagong sheets: `Procurements`, `PRs`, `SPPMPItems`, `Routing`, `Budgets`.
   - Ang lumang `Proposals` at `PRItems` ay **hindi binubura**; pinapalitan lang ang pangalan: `OLD Proposals`, `OLD PRItems`.
   - Pareho pa rin ang logins (naka-link pa rin sa Travel Order System).
4. **Procurement System → 2. Import 2026 records**: i-paste ulit ang URL ng 2026 file (Google Sheets version).
5. Kapag OK na ang laman, puwede nang i-delete ang `OLD Proposals` at `OLD PRItems`.
6. **Deploy → Manage deployments → ✏ → Version: New version → Deploy** (para hindi magbago ang link).

## Bagong setup (wala pang Google Sheet)
1. Gumawa ng bagong blank Google Sheet, pangalanan ng **Procurement System**.
2. **Extensions → Apps Script**. Palitan ang `Code.gs`; **+ → HTML** na `Index` → i-paste ang **Index.html**;
   **Project Settings (⚙)** → *Show "appsscript.json"* → i-paste ang **appsscript.json**. **Save**.
3. I-refresh ang Sheet → **Procurement System → 1. Setup sheets + admin login**
   (mag-a-authorize sa unang beses). Itatanong kung **gagamitin ang logins ng Travel Order System**:
   **YES** (recommended) → i-paste ang URL ng Google Sheet ng Travel Order System. **NO** → sariling `admin` login.
4. **2. Import 2026 records** *(optional pero recommended)*: i-upload sa Drive ang `Central Office_Activity Proposal 2026.xlsx`,
   buksan, **File → Save as Google Sheets**, at i-paste ang URL nito.
5. **3. Turn on backup every 3 months**: kopya ng Sheet tuwing Jan 1, Apr 1, Jul 1 at Oct 1 (folder "Procurement System Backups").
6. **Deploy → New deployment → ⚙ → Web app** · Execute as: **Me** · Who has access: **Anyone** → kopyahin ang link.

### Ano ang kinokopya ng Import 2026
- Bawat row ng bawat office tab → isang record. Kung may PR (Yes, may PR amount, o may DTS na nagsisimula sa `PR…`) → may PR din.
- DTS column: ang nagsisimula sa `PR…` ay DTS ng PR; ang `G#…` ay Logbook No.; ang iba ay DTS ng proposal.
- Checkbox ng SPPMP/PPMP → attachment ng PR. Mga note sa kanan ng DTS (hal. "FWD TO …") → Remarks.
- May "CANCELLED 6-8-26" sa note → naka-**Cancelled**, petsa 6-8-26.
- **Hula lang ang klase ng procurement** (Event, Equipment, Repair, Hiring, Others) base sa title. I-correct kapag ine-edit.
- Walang venue/petsa noong 2026, kaya blangko. Ang lumang PR ay hindi minamarkahang "Incomplete".

## Users
Admin = lahat · Encoder = gumawa/mag-edit/mag-cancel ng records at maglagay ng budget · Viewer = tingin lang.
Kung naka-link sa Travel Order System, iisa ang users ng dalawang app (Users tab ng alinmang app).

## Paano gamitin

### Step 1 – Proposal (**+ New Procurement**)
| Ilalagay | Paliwanag |
|---|---|
| Date received, Office, **Prepared by, DTS No., Logbook No. (G#)** | Lahat **required** (maliban kapag ine-edit ang record na galing sa 2026 import) |
| **Para sa taon (FY)** | Kusang naka-set sa taon ng Date received. Palitan lang kapag **early procurement** (hal. natanggap Nob 2026 para sa 2027). |
| **Anong klaseng procurement?** | **Event** (may venue at petsa) · **Equipment** · **Repair** · **Hiring of Personnel** (may simula at katapusan ng kontrata) · **Others** |
| **Proposal** | **Activity Proposal** · **Project Proposal** · **Wala (PR lang)**, at ang status nito |
| **Authority to Conduct** | i-check kung meron, at ang status |
| Title, Amount | Kapag Event: **Venue** at **Date** (required). Kapag Hiring: **Contract start/end** (required). |
| **Anong equipment? / Ano ang ire-repair?** | Lumalabas kapag **Equipment** o **Repair** (required), o **Others** (optional). Isang item bawat linya, hal. *2 units laptop*. |

Status ng bawat dokumento: **For Review FPED**, **Signed w/o FPED Review**, **Signed w/ FPED Review**.

### Step 2 – Purchase Request (**+ PR**, o sa record → **+ Add PR**)
1. Hanapin ang procurement: i-type ang **DTS ng proposal**, title, office o ID (kasama ang lahat ng taon).
2. Kusang nakopya ang title, venue, petsa, requisitioner (at amount kung unang PR). Palitan kung iba.
3. Ilagay: **DTS ng PR**, Date received, PR date, Requisitioner, Title, Venue at Date (kung Event), Amount, PR status.
4. **Attachments**:
   - **May PPMP**, o **Walang PPMP – may SPPMP** (kailangan ng *justification re SPPMP*), o **Wala pareho**.
   - Kung Event: **Government** o **Non-Government facility**. Non-Government → kailangan ng *justification*.
5. Kapag may kulang, **mase-save pa rin** pero may pulang **Incomplete – return to office**, at makikita sa Dashboard.
   Pagkabalik sa office: sa record → **Returned to office** (petsa, oras, kanino). Ang tag ay magiging **Returned to office**.
   Kapag bumalik na kumpleto, **Edit PR** at kumpletuhin; mawawala ang pulang tag.
6. Isang procurement, puwedeng maraming PR.

### Step 3 – SPPMP (pagbalik ng papel)
Hindi ito kasama sa PR form. Pagkatapos ma-encode ang PR, ibinabalik ang papel sa office; **pagbalik nito sa FPED**, buksan ang
record → sa PR card → **Step 3 · + Ilagay ang SPPMP**: **Activity / Item / Description** at **Amount** (+ Add item), at ang
*justification re SPPMP*. May total, at makikita kung iba sa amount ng PR. Pagka-save, naka-**SPPMP** na ang PR.
Lumalabas ang button sa bawat PR na **SPPMP** o **Wala pareho**. Kapag **May PPMP**, nakasulat lang na *hindi kailangan ng SPPMP*
(kung SPPMP pala ang dumating, **Edit PR** → piliin ang SPPMP). **Edit SPPMP** para baguhin.

Ang **cancelled na PR** ay title lang ang nakikita (naka-guhit); pindutin ang **Details** para sa buong detalye at **Restore PR**.
Ang record window ay nagsasara kapag nag-click sa labas nito o pinindot ang **Esc**.

### Step 4 – Routing (sa record → **+ Add entry**, o **+ Routing** sa PR)
Ilagay kung **kanino ipinasa / sino ang nag-review**, ang **date at time**, at para saan (Proposal o aling PR).
Pagpipilian: Forwarded for review, Reviewed, Signed, Returned to office, Received back, Other.
Ang mali ang na-encode ay puwedeng tanggalin (✕) ng nag-encode o ng Admin.

### Na-cancel / binago ang petsa (bagong PR)
- **Cancel PR** (o **Cancel procurement** para sa buong record): ilagay ang **date, time, sino ang nagsabi na i-cancel**, at reason.
  Hindi nabubura; nananatili sa listahan na may tag na *cancelled*.
- Bagong PR para sa parehong activity: **+ Add PR** sa parehong record → sa **Kapalit ng na-cancel na PR?**, piliin ang DTS ng lumang PR
  (kusang napipili kung may cancelled na PR ang record). Makikita sa dalawang PR: *Kapalit ng …* at *Pinalitan ng …*.
- **Restore** para ibalik. Naka-record sa Remarks at AuditLog kung sino, kailan at bakit.

### Para sa taon (FY) / early procurement
- Ang **FY** ang taon ng pondo. Karaniwan ito ang taon ng *Date received*, kaya hindi na kailangang galawin.
- **Early procurement** (natanggap Nob–Dis 2026 para sa 2027): piliin ang **2027 — early procurement**. Mangyayari:
  nasa listahan ng **2027** ang record (piliin ang 2027 sa itaas), sa **2027 budget** ibabawas ang mga PR nito, at ang ID ay
  **PROC-2027-…** / **PR-2027-…** kahit 2026 pa natanggap ang PR. May tag na **Early · FY 2027**.
- Sa Dashboard ng kasalukuyang taon: *"May N early procurement para sa 2027"* → **Tingnan ang 2027**.
- Puwede ring piliin ang nakaraang taon (hal. natanggap Enero 2027 para sa pondo ng 2026).
- **Mali ang napiling taon?** Edit → palitan ang FY → Save. Magkakaroon ng ID ng bagong taon ang record at ang mga PR nito
  (pati sa SPPMP, routing, *Repeat of* at *Kapalit ng*), at nakasulat sa Remarks ang dating ID.

### Budget (**Budget** tab)
- **Set budget** sa bawat office (para sa taong naka-select sa itaas).
- Kusang **ibinabawas ang amount ng bawat PR** ng mga procurement na may FY ng taong iyon. Ang cancelled na PR (o PR ng cancelled na procurement)
  ay hindi kasama, kaya naibabalik ang pera.
- Makikita: Budget, Used, **Remaining**, % used. Pula kapag lampas.
- Sa PR form, makikita agad kung magkano ang matitira pagkatapos ng PR. **Kapag lampas, may babala pero puwede pa ring i-save.**

## Kahawig na activity (repeat check)
Habang tinatype ang title, lumalabas ang **⚠ May kahawig na activity na ang (office)**. Kapag sa parehong office, kailangang sagutin ang
**"Repeat ba ito?"** (Repeat · Re-submission · Kaparehong activity · Hindi pareho). Kung PR lang ang idadagdag sa naipasa na,
gamitin ang **+ Add PR** sa lumang record. Ang **Repeated** tab ay nagpapakita ng magkakahawig na records (lahat ng taon).

## Record ID
**PROC-2027-00001** (procurement) at **PR-2027-00001** (PR). Ang taon ay ang **FY** ng procurement (karaniwan ang taon ng
*Date received*; sa early procurement, ang susunod na taon). Nagsisimula ulit sa 00001 bawat taon.

## Para sa admin: mga sheet
| Sheet | Laman |
|---|---|
| `Procurements` | Isang row bawat procurement (step 1). `Item Details` = equipment / ire-repair; `Fiscal Year` = taon ng pondo (blangko = taon ng Date received). |
| `PRs` | Isang row bawat Purchase Request (step 2) |
| `SPPMPItems` | Isang row bawat SPPMP item (step 3) |
| `Routing` | Isang row bawat routing entry (step 4) |
| `Budgets` | Budget bawat office bawat taon |
| `Users` | Mga login (wala kung naka-link sa Travel Order System) |
| `AuditLog` | Sino ang gumawa, nag-edit, nag-cancel, nag-restore, nagbago ng budget at users |
| `Settings` | Listahan ng offices (column A). Dito magdagdag ng bagong office. |

**Huwag i-edit nang mano-mano ang mga ID column (`Record ID`, `PR ID`, `Entry ID`) at ang `Users` sheet.** Gamitin ang web app.
**Huwag i-share ang Google Sheet sa mga encoder.** Web app link lang ang ibigay.
