/**
 * PROCUREMENT SYSTEM (web app)
 * Backend: the Google Sheet this script is bound to. Works across years — no yearly setup needed.
 *
 * One record = one procurement, followed in 4 steps:
 *   1. Proposal  – Activity Proposal or Project Proposal (and/or Authority to Conduct) and the kind of
 *                  procurement: Event (venue + date), Equipment, Repair, Hiring of Personnel (contract duration), Others
 *   2. Purchase Request(s) – each with its own DTS. Attachments: PPMP, or an SPPMP with a justification;
 *                  for events also a Government or Non-Government facility (Non-Government needs a justification).
 *                  A PR with missing attachments is still saved, flagged "Incomplete – return to office".
 *   3. SPPMP items of a PR (activity / item / description + amount), encoded when the papers come back from the office
 *   4. Routing   – to whom the papers went / who reviewed them, with date and time
 * Cancelling a record or a PR keeps the date, time and the person who asked for it. A new PR can point to
 * the cancelled PR it replaces. PR amounts are deducted from the budget of the office for the year.
 *
 * Sheets (created by Setup):
 *   Procurements – one row per record (step 1)
 *   PRs          – one row per Purchase Request (step 2)
 *   SPPMPItems   – one row per SPPMP item of a PR (step 3)
 *   Routing      – one row per routing entry (step 4)
 *   Budgets      – budget per office per year
 *   Users        – app logins (username + hashed password + role)
 *   AuditLog     – who did what, when
 *   Settings     – list of offices (column A)
 *
 * When a title looks like an earlier record, saving asks what it is
 * (repeat / re-submission / part of the same activity / not the same) so repeated activities are visible.
 *
 * Roles: Admin (everything + manage users), Encoder (records + budgets), Viewer (read only)
 */

const SHEETS = {
  recs: 'Procurements',
  prs: 'PRs',
  sppmp: 'SPPMPItems',
  routing: 'Routing',
  budgets: 'Budgets',
  users: 'Users',
  audit: 'AuditLog',
  settings: 'Settings',
};

const CANCEL_COLS = ['Status', 'Cancelled At', 'Cancel Requested By', 'Cancel Reason', 'Cancelled By'];
const HEADERS = {
  Procurements: ['Record ID', 'Date Received', 'Office', 'Prepared By', 'Proposal Type', 'With ATC', 'Procurement Type',
    'Title', 'Venue', 'Start', 'End', 'Amount', 'Proposal Status', 'ATC Status', 'DTS No.', 'Logbook No.']
    .concat(CANCEL_COLS, ['Repeat Type', 'Repeat Of', 'Repeat Note', 'Remarks', 'Source', 'Encoded By', 'Encoded At',
      'Updated At', 'Updated By',
      'Item Details']), // added later: new columns go at the end so the sheets already in use keep their columns
  PRs: ['PR ID', 'Record ID', 'DTS No.', 'Date Received', 'PR Date', 'Requisitioner', 'Title', 'Venue', 'Start', 'End',
    'Amount', 'Plan', 'SPPMP Justification', 'Facility', 'Facility Justification', 'PR Status']
    .concat(CANCEL_COLS, ['Replaces PR', 'Remarks', 'Source', 'Encoded By', 'Encoded At', 'Updated At', 'Updated By']),
  SPPMPItems: ['PR ID', 'Line', 'Activity / Item / Description', 'Amount'],
  Routing: ['Entry ID', 'Record ID', 'PR ID', 'Date & Time', 'Action', 'Person', 'Remarks', 'Encoded By', 'Encoded At'],
  Budgets: ['Year', 'Office', 'Budget', 'Updated By', 'Updated At'],
  Users: ['Username', 'Full Name', 'Role', 'Active', 'Salt', 'Password Hash', 'Created At', 'Last Login'],
  AuditLog: ['Timestamp', 'Username', 'Action', 'Record ID', 'Details'],
  Settings: ['Offices'],
};

// column positions (0-based), so the code reads like the sheet: C = Procurements, P = PRs, R = Routing
const C = {}, P = {}, R = {};
HEADERS.Procurements.forEach((h, i) => { C[h] = i; });
HEADERS.PRs.forEach((h, i) => { P[h] = i; });
HEADERS.Routing.forEach((h, i) => { R[h] = i; });

const DEFAULT_OFFICES = ['ADMIN', 'ADJU', 'ADOTECH', 'ARS', 'BAC', 'CASHIER', 'CFD', 'DO', 'ENGR', 'EPSDP', 'FIDSSD',
  'FIMC', 'FINANCE', 'FIQD', 'FISHCORE', 'FPHTD', 'FRLD', 'FRMD', 'FRPG', 'FSP', 'GAD', 'GSS', 'HIPON', 'HRM', 'IAS',
  'IFAD', 'IFCU', 'IMEMS', 'IPRG', 'LEGAL', 'LIB', 'NFARMCPMC', 'NFLD', 'PROPERTY', 'SAAD', 'USEC', 'VMS'];

const DOC_STATUS = ['For Review FPED', 'Signed w/o FPED Review', 'Signed w/ FPED Review'];
const PROPOSAL_TYPES = ['Activity Proposal', 'Project Proposal', 'None'];
const PROC_TYPES = ['Event', 'Equipment', 'Repair', 'Hiring of Personnel', 'Others'];
const DETAIL_TYPES = ['Equipment', 'Repair', 'Others'];    // kinds with "Item Details" (what equipment / what is repaired)
const DETAIL_REQUIRED = ['Equipment', 'Repair'];
const PLANS = ['PPMP', 'SPPMP'];
const FACILITIES = ['Government', 'Non-Government'];
const ROUTE_ACTIONS = ['Forwarded for review', 'Reviewed', 'Signed', 'Returned to office', 'Received back', 'Other'];
const REPEAT_TYPES = ['Repeat', 'Resubmission', 'Same activity', 'Different'];

const ROLES = ['Admin', 'Encoder', 'Viewer'];
const TIMEZONE = 'Asia/Manila';
const SESSION_SECONDS = 8 * 60 * 60;   // login lasts 8 hours of inactivity
const SESSION_TOUCH_SECONDS = 5 * 60;  // the last-seen time of a login is saved at most every 5 minutes
const CACHE_MAX_SECONDS = 6 * 60 * 60; // CacheService keeps values 6 hours at most
const MAX_FAILED_LOGINS = 5;           // then the username is locked for 15 minutes
const USER_CHECK_SECONDS = 600;        // how often a logged-in user is re-checked (active? role?) in the shared Users sheet
const HASH_ROUNDS = 200;
const BACKUP_FOLDER = 'Procurement System Backups';
const BACKUPS_TO_KEEP = 24;            // 24 quarterly backups = 6 years
const BACKUP_MONTHS = [1, 4, 7, 10];   // every 3 months: Jan 1, Apr 1, Jul 1, Oct 1
const IMPORT_SOURCE = 'Import 2026';
const USERS_FROM_PROP = 'USERS_SPREADSHEET_ID'; // set by linkUsers()
const OLD_SHEETS = ['Proposals', 'PRItems'];    // sheets of the first version (Activity Proposal System)

/* ======================== SETUP / MENU ======================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Procurement System')
    .addItem('1. Setup sheets + admin login', 'setup')
    .addItem('2. Import 2026 records', 'import2026')
    .addItem('3. Turn on backup every 3 months', 'installBackup')
    .addSeparator()
    .addItem('Use logins of Travel Order System', 'linkUsers')
    .addItem('Backup now', 'backupNow')
    .addItem('Reset a user password', 'resetPasswordFromMenu')
    .addToUi();
}

/** Someone typed directly in the spreadsheet: drop the cached data so the app shows the change. */
function onEdit() {
  bumpDataVersion_();
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  ss.setSpreadsheetTimeZone(TIMEZONE);
  if (!linkedUsersId_() && !ss.getSheetByName(SHEETS.users) &&
      ui.alert('Logins', 'Use the same logins as the Travel Order System?\n\n' +
        'YES = same usernames and passwords (users are managed in the Travel Order System)\n' +
        'NO = this app gets its own logins', ui.ButtonSet.YES_NO) === ui.Button.YES) {
    if (!linkUsers()) return;
  }
  // sheets of the first version are kept (renamed), not deleted
  const renamed = OLD_SHEETS.filter(n => ss.getSheetByName(n) && !ss.getSheetByName('OLD ' + n));
  renamed.forEach(n => ss.getSheetByName(n).setName('OLD ' + n));

  const linked = !!linkedUsersId_();
  Object.keys(HEADERS).forEach(name => {
    if (linked && name === SHEETS.users) return;
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const head = HEADERS[name];
    if (sh.getMaxColumns() < head.length) sh.insertColumnsAfter(sh.getMaxColumns(), head.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, head.length).setValues([head])
      .setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  });
  const fmt = (name, cols, f) => {
    const sh = ss.getSheetByName(name);
    cols.forEach(h => sh.getRange(1, HEADERS[name].indexOf(h) + 1, sh.getMaxRows(), 1).setNumberFormat(f));
  };
  fmt(SHEETS.recs, ['Date Received', 'Start', 'End'], 'yyyy-mm-dd');
  fmt(SHEETS.recs, ['Cancelled At', 'Encoded At', 'Updated At'], 'yyyy-mm-dd hh:mm');
  fmt(SHEETS.recs, ['Amount'], '#,##0.00');
  fmt(SHEETS.prs, ['Date Received', 'PR Date', 'Start', 'End'], 'yyyy-mm-dd');
  fmt(SHEETS.prs, ['Cancelled At', 'Encoded At', 'Updated At'], 'yyyy-mm-dd hh:mm');
  fmt(SHEETS.prs, ['Amount'], '#,##0.00');
  fmt(SHEETS.sppmp, ['Amount'], '#,##0.00');
  fmt(SHEETS.routing, ['Date & Time', 'Encoded At'], 'yyyy-mm-dd hh:mm');
  fmt(SHEETS.budgets, ['Budget'], '#,##0.00');
  if (!linked) ss.getSheetByName(SHEETS.users).hideColumns(5, 2); // salt + hash

  const settings = ss.getSheetByName(SHEETS.settings);
  if (settings.getLastRow() < 2) {
    settings.getRange(2, 1, DEFAULT_OFFICES.length, 1).setValues(DEFAULT_OFFICES.map(o => [o]));
    forget_(SHEETS.settings);
  }
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  bumpDataVersion_();

  const note = renamed.length ? `\n\nThe sheets of the old version were renamed to ${renamed.map(n => '"OLD ' + n + '"').join(' and ')}. ` +
    'Run "2. Import 2026 records" again to load the 2026 file into the new sheets; the OLD sheets can be deleted after that.' : '';
  if (linked) {
    ui.alert('Setup done.\n\nLogins are the same as in the Travel Order System.\nNext: Deploy > New deployment > Web app.' + note);
    return;
  }
  if (!rows_(SHEETS.users).length) {
    const pw = askPassword_(ui, 'Create the first ADMIN login.\nUsername will be: admin\n\nEnter a password (at least 8 characters):');
    if (!pw) { ui.alert('Setup finished, but no admin was created. Run Setup again to create it.'); return; }
    writeRow_(SHEETS.users, 0, newUserRow_('admin', 'Administrator', 'Admin', pw));
    audit_('admin', 'ADD_USER', 'admin', 'Created during setup');
  }
  ui.alert('Setup done.\n\nLogin: admin + the password you entered.\nNext: Deploy > New deployment > Web app.' + note);
}

/**
 * Makes this app use the Users sheet of the Travel Order System spreadsheet, so both apps have the
 * same usernames, passwords and roles. The spreadsheet owner (who deploys as "Me") must be able to open it.
 * Returns true when linked.
 */
function linkUsers() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Use logins of Travel Order System',
    'Paste the URL of the Travel Order System Google Sheet (the one with the Users sheet):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return false;
  let users;
  try {
    users = SpreadsheetApp.openByUrl(res.getResponseText().trim()).getSheetByName(SHEETS.users);
  } catch (e) {
    ui.alert('Could not open that Google Sheet: ' + e.message);
    return false;
  }
  const head = users ? users.getRange(1, 1, 1, HEADERS.Users.length).getValues()[0].join('|') : '';
  if (head !== HEADERS.Users.join('|')) {
    ui.alert('That file has no Users sheet of the Travel Order System. Check the URL.');
    return false;
  }
  PropertiesService.getScriptProperties().setProperty(USERS_FROM_PROP, users.getParent().getId());
  audit_('(spreadsheet owner)', 'LINK_USERS', users.getParent().getId(), users.getParent().getName());
  ui.alert(`Linked. This app now uses the ${users.getLastRow() - 1} login(s) of "${users.getParent().getName()}".`);
  return true;
}

function askPassword_(ui, msg) {
  const res = ui.prompt('Password', msg, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return '';
  const pw = res.getResponseText();
  if (pw.length < 8) { ui.alert('Password must be at least 8 characters.'); return ''; }
  return pw;
}

/** For when an admin forgets their password: run from the spreadsheet menu (spreadsheet owner only). */
function resetPasswordFromMenu() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Reset password', 'Username:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const username = res.getResponseText().trim().toLowerCase();
  const row = findRow_(SHEETS.users, username);
  if (!row) { ui.alert(`User "${username}" not found.`); return; }
  const pw = askPassword_(ui, `New password for ${username} (at least 8 characters):`);
  if (!pw) return;
  const salt = Utilities.getUuid();
  sheet_(SHEETS.users).getRange(row, 4, 1, 3).setValues([['Yes', salt, hash_(pw, salt)]]);
  CacheService.getScriptCache().remove('fail_' + username);
  audit_('(spreadsheet owner)', 'RESET_PASSWORD', username, '');
  ui.alert(`Password of ${username} has been reset.`);
}

/* ======================== IMPORT 2026 ======================== */

/**
 * One-time helper: copies the 2026 records (one tab per office) into the new sheets, so that new records
 * can be checked against them. The Excel file must first be opened in Google Sheets (File > Save as Google Sheets).
 * Venue and date were not recorded in 2026, so they stay blank. The kind of procurement is guessed from the title.
 */
function import2026() {
  const ui = SpreadsheetApp.getUi();
  if (rows_(SHEETS.recs).some(r => String(r[C.Source]) === IMPORT_SOURCE)) {
    ui.alert('The 2026 records were already imported. Delete the rows with Source = "Import 2026" (in Procurements and PRs) first to import again.');
    return;
  }
  const res = ui.prompt('Import 2026 records',
    'Paste the URL of the 2026 Activity Proposal Google Sheet (the Excel file saved as Google Sheets):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const src = SpreadsheetApp.openByUrl(res.getResponseText().trim());

  const known = new Set(rows_(SHEETS.settings).map(r => String(r[0]).trim().toUpperCase()));
  const records = [];
  src.getSheets().forEach(sh => {
    if (sh.getLastRow() < 3) return;
    const values = sh.getRange(1, 1, sh.getLastRow(), Math.min(sh.getLastColumn(), 40)).getValues();
    parseLegacySheet_(sh.getName().trim().toUpperCase(), values).forEach(r => records.push(r));
  });
  if (!records.length) { ui.alert('No records found in that file.'); return; }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const now = new Date();
    const next = {};
    const nextId = (kind, d) => {
      const prefix = `${kind}-${d ? Utilities.formatDate(d, TIMEZONE, 'yyyy') : '2026'}-`;
      if (!next[prefix]) next[prefix] = nextNumber_(kind === 'PR' ? SHEETS.prs : SHEETS.recs, prefix);
      return prefix + String(next[prefix]++).padStart(5, '0');
    };
    const recRows = [], prRows = [];
    records.sort((a, b) => (a.received || 0) - (b.received || 0)).forEach(r => {
      const id = nextId('PROC', r.received);
      const row = new Array(HEADERS.Procurements.length).fill('');
      row[C['Record ID']] = id; row[C['Date Received']] = r.received || ''; row[C.Office] = r.office;
      row[C['Prepared By']] = r.preparedBy; row[C.Title] = r.title; row[C.Amount] = r.amount || '';
      row[C['Proposal Type']] = r.ap ? 'Activity Proposal' : 'None'; row[C['Proposal Status']] = r.ap || '';
      row[C['With ATC']] = r.atc ? 'Yes' : 'No'; row[C['ATC Status']] = r.atc || '';
      row[C['Procurement Type']] = guessType_(r.title);
      row[C['DTS No.']] = r.dts; row[C['Logbook No.']] = r.logbook; row[C.Status] = 'Active';
      if (r.cancelled) {
        row[C.Status] = 'Cancelled'; row[C['Cancelled At']] = r.cancelled;
        row[C['Cancel Requested By']] = '(not recorded in 2026)'; row[C['Cancel Reason']] = '(from the 2026 file)';
        row[C['Cancelled By']] = '(import)';
      }
      // the plan belongs to the PR now; without a PR it is kept in the remarks
      const planNote = r.planType && !r.hasPr ? `2026 file: ${r.planType}${r.planStatus ? ' – ' + r.planStatus : ''}` : '';
      row[C.Remarks] = [r.notes, planNote].filter(String).join(' | ').slice(0, 1000);
      row[C.Source] = IMPORT_SOURCE; row[C['Encoded By']] = '(import)'; row[C['Encoded At']] = now;
      recRows.push(row);
      if (r.hasPr) {
        const p = new Array(HEADERS.PRs.length).fill('');
        p[P['PR ID']] = nextId('PR', r.received); p[P['Record ID']] = id; p[P['DTS No.']] = r.prDts;
        p[P['Date Received']] = r.received || ''; p[P.Title] = r.title; p[P.Amount] = r.prAmount || '';
        p[P.Plan] = r.planType; p[P['SPPMP Justification']] = r.planType === 'SPPMP' ? '(not recorded in 2026)' : '';
        p[P.Status] = 'Active'; p[P.Source] = IMPORT_SOURCE; p[P['Encoded By']] = '(import)'; p[P['Encoded At']] = now;
        prRows.push(p);
      }
      if (r.office && !known.has(r.office)) { known.add(r.office); writeRow_(SHEETS.settings, 0, [r.office]); }
    });
    const rs = sheet_(SHEETS.recs);
    rs.getRange(rs.getLastRow() + 1, 1, recRows.length, recRows[0].length).setValues(recRows);
    if (prRows.length) {
      const ps = sheet_(SHEETS.prs);
      ps.getRange(ps.getLastRow() + 1, 1, prRows.length, prRows[0].length).setValues(prRows);
    }
    forget_(SHEETS.recs); forget_(SHEETS.prs);
    bumpDataVersion_();
    audit_('(spreadsheet owner)', 'IMPORT_2026', '', `${recRows.length} records, ${prRows.length} PRs`);
    ui.alert(`${recRows.length} record(s) and ${prRows.length} PR(s) imported.\n\n` +
      'The kind of procurement (Event, Equipment, …) was guessed from the title; correct it when you edit a record.');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Reads one office tab of the 2026 workbook. The columns differ a little per tab, so they are found
 * by their headers: row 1 has the document groups (ACTIVITY PROPOSAL, AUTHORITY TO CONDUCT, SPPMP, PPMP),
 * the next row has DATE RECEIVED, PREPARED BY, DETAILS, AMOUNT, the checkbox columns, PURCHASE REQUEST,
 * AMOUNT and DTS AND LOGBOOK NUMBER. A ticked checkbox gives the status of that document.
 * Notes written after the DTS column ("FWD TO …", "CANCELLED 6-8-26") go to the remarks.
 */
function parseLegacySheet_(office, values) {
  const h = values.findIndex(r => r.some(v => String(v).trim().toUpperCase() === 'DETAILS'));
  if (h < 0) return [];
  const head = values[h].map(v => String(v).replace(/\s+/g, ' ').trim().toUpperCase());
  const groupRow = h > 0 ? values[h - 1].map(v => String(v).toUpperCase()) : [];
  const col = name => head.indexOf(name);
  const cDate = col('DATE RECEIVED'), cBy = col('PREPARED BY'), cDetails = col('DETAILS'), cAmt = col('AMOUNT');
  const cPr = col('PURCHASE REQUEST');
  const cPrAmt = head.indexOf('AMOUNT', cAmt + 1);
  const cDts = head.findIndex(x => x.indexOf('DTS') === 0);

  // document groups: from the group label to the column before the next label
  const starts = [];
  groupRow.forEach((g, i) => {
    const key = g.indexOf('PROPOSAL') >= 0 ? 'ap' : g.indexOf('CONDUCT') >= 0 ? 'atc'
      : g.indexOf('SPPMP') >= 0 ? 'sppmp' : g.indexOf('PPMP') >= 0 ? 'ppmp' : '';
    if (key && i > cAmt) starts.push({ key, from: i });
  });
  const stop = [cPr, cPrAmt, cDts].filter(i => i > cAmt).reduce((a, b) => Math.min(a, b), head.length);
  starts.forEach((g, i) => { g.to = (i + 1 < starts.length ? starts[i + 1].from : stop) - 1; });

  const out = [];
  for (let r = h + 1; r < values.length; r++) {
    const row = values[r];
    const title = String(row[cDetails] || '').replace(/\s+/g, ' ').trim().replace(/^[-•]\s*/, '');
    if (!title) continue;
    const rec = { office, received: legacyDate_(row[cDate]), preparedBy: String(row[cBy] || '').replace(/\s+/g, ' ').trim(),
      title, amount: legacyAmount_(row[cAmt]), ap: '', atc: '', planType: '', planStatus: '',
      hasPr: false, prAmount: 0, dts: '', prDts: '', logbook: '', notes: '', cancelled: null };
    const status = {};
    starts.forEach(g => {
      for (let c = g.from; c <= g.to; c++) {
        if (row[c] === true || String(row[c]).toUpperCase() === 'TRUE') status[g.key] = legacyStatus_(head[c]);
      }
    });
    rec.ap = status.ap || ''; rec.atc = status.atc || '';
    if (status.sppmp) { rec.planType = 'SPPMP'; rec.planStatus = status.sppmp; }
    else if (status.ppmp) { rec.planType = 'PPMP'; rec.planStatus = status.ppmp; }

    // "O26010984AD\nPR26010132LIB\nG#151" -> DTS of the proposal, DTS of the PR, logbook number
    const dtsLines = cDts >= 0 ? String(row[cDts] || '').split('\n').map(s => s.trim()).filter(String) : [];
    rec.logbook = dtsLines.filter(s => /^G#/i.test(s)).join(', ');
    rec.prDts = dtsLines.filter(s => /^PR\d/i.test(s)).join(', ');
    rec.dts = dtsLines.filter(s => !/^G#/i.test(s) && !/^PR\d/i.test(s)).join(', ');

    // the PR amount cell may hold one amount per line
    const prAmounts = cPrAmt >= 0 ? String(row[cPrAmt] == null ? '' : row[cPrAmt]).split('\n').map(legacyAmount_).filter(a => a > 0) : [];
    rec.prAmount = prAmounts.reduce((a, b) => a + b, 0);
    rec.hasPr = (cPr >= 0 && String(row[cPr]).trim().toUpperCase() === 'YES') || rec.prAmount > 0 || !!rec.prDts;

    const notes = cDts >= 0 ? row.slice(cDts + 1).map(v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()).filter(String) : [];
    rec.notes = notes.join(' | ');
    const m = /CANCELL?ED\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})?/i.exec(rec.notes);
    if (m) rec.cancelled = (m[1] && legacyDate_(m[1])) || rec.received || new Date(2026, 0, 1);
    out.push(rec);
  }
  return out;
}

/** Best guess of the kind of procurement from a 2026 title (checked in this order). */
function guessType_(title) {
  const t = String(title).toUpperCase();
  if (/\b(RE-?)?HIRING\b|JOB ORDER|CONTRACT OF SERVICE|CONSULTANT/.test(t)) return 'Hiring of Personnel';
  if (/REPAIR|MAINTENANCE|SERVICING|CLEANING(?! MATERIALS| SUPPLIES)|\bPARTS\b/.test(t)) return 'Repair';
  if (/TRAINING|WORKSHOP|WRITESHOP|MEETING|SEMINAR|CONFERENCE|ORIENTATION|FORUM|CONSULTATION|CONSULTATIVE|ASSEMBLY|CELEBRATION|SUMMIT|CONVENTION|CONGRESS|SYMPOSIUM|FESTIVAL|LAUNCH|COURSE|CAPACITY BUILDING|TEAM BUILDING|PLANNING|ASSESSMENT|EVALUATION|DIALOGUE|BRIEFING|WELLNESS|MEALS|FOOD|VENUE|CATERING|ACCOM+ODATION|RENTAL/.test(t)) return 'Event';
  if (/LAPTOP|DESKTOP|COMPUTER|PRINTER|EQUIPMENT|SCANNER|PROJECTOR|AIRCON|AIR CONDITION|FURNITURE|VEHICLE|TABLET|CAMERA|MACHINE|\bUPS\b/.test(t)) return 'Equipment';
  return 'Others';
}

/** "FOR REVIEW FPED 2", "SIGNED W/ PROPER PROCESS" -> one of DOC_STATUS */
function legacyStatus_(header) {
  if (header.indexOf('FOR REVIEW') === 0) return DOC_STATUS[0];
  if (header.indexOf('W/O') >= 0) return DOC_STATUS[1];
  return DOC_STATUS[2];
}

/** Date cell, or text like "2-27-26" / "3/10/2026" */
function legacyDate_(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/.exec(String(v || '').trim());
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return new Date(y, +m[1] - 1, +m[2]);
}

/** 348500, "348,500", "-", "" -> number (0 when blank) */
function legacyAmount_(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v || '').replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

/* ======================== BACKUP ======================== */

/**
 * Apps Script has no "every 3 months" trigger, so a monthly trigger runs quarterlyBackup,
 * which only makes a copy in the months listed in BACKUP_MONTHS.
 */
function installBackup() {
  ScriptApp.getProjectTriggers()
    .filter(t => ['backupNow', 'quarterlyBackup'].indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('quarterlyBackup').timeBased().onMonthDay(1).atHour(6).create();
  backupNow();
  SpreadsheetApp.getUi().alert(`Backup every 3 months is on (Jan 1, Apr 1, Jul 1, Oct 1).\n` +
    `A first backup was made just now.\n` +
    `Copies are saved in Google Drive folder "${BACKUP_FOLDER}" (latest ${BACKUPS_TO_KEEP} are kept).`);
}

function quarterlyBackup() {
  const month = parseInt(Utilities.formatDate(new Date(), TIMEZONE, 'M'), 10);
  if (BACKUP_MONTHS.indexOf(month) >= 0) backupNow();
}

function backupNow() {
  const ss = SpreadsheetApp.getActive();
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(BACKUP_FOLDER);
  DriveApp.getFileById(ss.getId()).makeCopy(`${ss.getName()} – backup ${iso_(new Date())}`, folder);

  const files = [];
  const it = folder.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated())
    .slice(BACKUPS_TO_KEEP).forEach(f => f.setTrashed(true));
}

/* ======================== WEB APP ======================== */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Procurement System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // lets Google Sites embed the app
}

/* ======================== LOGIN ======================== */

function login(username, password) {
  username = String(username || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('fail_' + username) || 0);
  if (fails >= MAX_FAILED_LOGINS) throw new Error('Too many wrong attempts. Try again after 15 minutes.');

  // one read of the (small) Users sheet instead of a lookup and then a second read
  const all = colValues_(SHEETS.users, HEADERS.Users.length);
  const i = all.findIndex(x => String(x[0]).trim().toLowerCase() === username);
  const r = i >= 0 ? all[i] : null;
  const ok = r && isYes_(r[3]) && hash_(String(password || ''), String(r[4])) === String(r[5]);
  if (!ok) {
    cache.put('fail_' + username, String(fails + 1), 15 * 60);
    throw new Error('Wrong username or password.');
  }
  cache.remove('fail_' + username);
  sheet_(SHEETS.users).getRange(i + 2, 8).setValue(new Date());

  const user = { username, name: String(r[1]), role: String(r[2]) };
  const token = Utilities.getUuid() + Utilities.getUuid();
  clearOldSessions_();
  saveSession_(token, Object.assign({ seen: Date.now() }, user));
  cache.put('uok_' + username, JSON.stringify({ role: user.role, name: user.name }), USER_CHECK_SECONDS);
  // the data comes back with the login, so the browser does not need a second round trip
  return { token, user, data: dataFor_(user) };
}

function logout(token) {
  endSession_(token);
  return true;
}

/* Logins are kept in Script Properties (CacheService cannot keep anything longer than 6 hours),
   with a copy in the cache so most calls do not have to read the properties. */

function saveSession_(token, s) {
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(s), CACHE_MAX_SECONDS);
  PropertiesService.getScriptProperties().setProperty('sess_' + token, JSON.stringify(s));
}

function endSession_(token) {
  CacheService.getScriptCache().remove('sess_' + token);
  PropertiesService.getScriptProperties().deleteProperty('sess_' + token);
}

/** The login of this token, or null when there is none or it was unused for SESSION_SECONDS. */
function getSession_(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('sess_' + token) ||
    PropertiesService.getScriptProperties().getProperty('sess_' + token);
  if (!raw) return null;
  const s = JSON.parse(raw);
  const now = Date.now();
  if (now - s.seen > SESSION_SECONDS * 1000) { endSession_(token); return null; }
  if (now - s.seen > SESSION_TOUCH_SECONDS * 1000) { s.seen = now; saveSession_(token, s); } // sliding expiry
  return s;
}

/** Removes expired logins of people who closed the browser without logging out. */
function clearOldSessions_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const limit = Date.now() - SESSION_SECONDS * 1000;
  Object.keys(all).forEach(k => {
    if (k.indexOf('sess_') !== 0) return;
    let seen = 0;
    try { seen = JSON.parse(all[k]).seen || 0; } catch (e) { /* broken entry: remove it */ }
    if (seen < limit) props.deleteProperty(k);
  });
}

/** Throws SESSION_EXPIRED if the token is not valid; checks the role when roles are given. */
function auth_(token, roles) {
  const cache = CacheService.getScriptCache();
  const s = getSession_(token);
  if (!s) throw new Error('SESSION_EXPIRED');
  const user = { username: s.username, name: s.name, role: s.role };
  // the user may have been deactivated or changed role since logging in;
  // checked against the Users sheet at most every USER_CHECK_SECONDS (saveUser clears this cache)
  let info = cache.get('uok_' + user.username);
  if (!info) {
    const r = colValues_(SHEETS.users, 4).find(x => String(x[0]).trim().toLowerCase() === user.username);
    info = JSON.stringify(r && isYes_(r[3]) ? { role: String(r[2]), name: String(r[1]) } : null);
    cache.put('uok_' + user.username, info, USER_CHECK_SECONDS);
  }
  const current = JSON.parse(info);
  if (!current) { endSession_(token); throw new Error('SESSION_EXPIRED'); }
  user.role = current.role; user.name = current.name;
  if (roles && roles.indexOf(user.role) < 0) throw new Error('You do not have permission to do this.');
  return user;
}

function changePassword(token, oldPw, newPw) {
  const user = auth_(token);
  if (String(newPw || '').length < 8) throw new Error('New password must be at least 8 characters.');
  const row = findRow_(SHEETS.users, user.username);
  const sh = sheet_(SHEETS.users);
  const r = sh.getRange(row, 1, 1, 6).getValues()[0];
  if (hash_(String(oldPw || ''), String(r[4])) !== String(r[5])) throw new Error('Current password is wrong.');
  const salt = Utilities.getUuid();
  sh.getRange(row, 5, 1, 2).setValues([[salt, hash_(newPw, salt)]]); forget_(SHEETS.users);
  audit_(user.username, 'CHANGE_PASSWORD', user.username, '');
  return true;
}

function hash_(password, salt) {
  let h = salt + '|' + password;
  for (let i = 0; i < HASH_ROUNDS; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset.UTF_8));
  }
  return h;
}

function newUserRow_(username, name, role, password) {
  const salt = Utilities.getUuid();
  return [username, name, role, 'Yes', salt, hash_(password, salt), new Date(), ''];
}

/* ======================== USERS (Admin) ======================== */

function getUsers(token) {
  auth_(token, ['Admin']);
  return rows_(SHEETS.users).map(r => ({
    username: String(r[0]), name: String(r[1]), role: String(r[2]), active: isYes_(r[3]),
    lastLogin: r[7] instanceof Date ? Utilities.formatDate(r[7], TIMEZONE, 'yyyy-MM-dd HH:mm') : '',
  }));
}

/** u = { username, name, role, active, password?, isNew } */
function saveUser(token, u) {
  const admin = auth_(token, ['Admin']);
  const username = String(u.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Username: 3–30 letters/numbers, no spaces.');
  if (ROLES.indexOf(u.role) < 0) throw new Error('Invalid role.');
  if (u.password && String(u.password).length < 8) throw new Error('Password must be at least 8 characters.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(SHEETS.users);
    const row = findRow_(SHEETS.users, username);
    if (u.isNew) {
      if (row) throw new Error(`Username "${username}" is already taken.`);
      if (!u.password) throw new Error('Password is required for a new user.');
      sh.appendRow(newUserRow_(username, String(u.name || '').trim(), u.role, u.password));
      audit_(admin.username, 'ADD_USER', username, u.role);
    } else {
      if (!row) throw new Error(`User "${username}" not found.`);
      if (username === admin.username && (u.role !== 'Admin' || u.active === false)) {
        throw new Error('You cannot remove your own Admin access.');
      }
      sh.getRange(row, 2, 1, 3).setValues([[String(u.name || '').trim(), u.role, u.active === false ? 'No' : 'Yes']]);
      if (u.password) {
        const salt = Utilities.getUuid();
        sh.getRange(row, 5, 1, 2).setValues([[salt, hash_(u.password, salt)]]);
      }
      audit_(admin.username, 'UPDATE_USER', username,
        `${u.role}, ${u.active === false ? 'inactive' : 'active'}${u.password ? ', password reset' : ''}`);
    }
    forget_(SHEETS.users);
    CacheService.getScriptCache().remove('uok_' + username);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/* ======================== DATA ======================== */

/**
 * Full details are sent only for the selected year. The repeat check (and finding a record by DTS)
 * also needs the other years, so every record is sent in a short form too (see liteRow_), which keeps
 * loading fast as years pile up. Both parts are cached; any change clears the cache (bumpDataVersion_).
 */
function getData(token, year) {
  return dataFor_(auth_(token), year);
}

function dataFor_(user, year) {
  const today = iso_(new Date());
  year = parseInt(year, 10) || parseInt(today.slice(0, 4), 10);
  const ver = dataVersion_();
  let full = cacheGetBig_(`apf_${ver}_${year}`), lite = cacheGetBig_(`apl_${ver}`);
  if (!full || !lite) {
    const all = loadAll_();
    full = {
      records: all.recs.filter(r => yearOf_(r) === year).map(r => slim_(fullRecord_(r, all))),
      budgets: budgetSummary_(year, all),
    };
    lite = all.recs.map(r => liteRow_(r, all.prsByRec[String(r[0])] || []));
    cachePutBig_(`apf_${ver}_${year}`, full);
    cachePutBig_(`apl_${ver}`, lite);
  }
  const offices = rows_(SHEETS.settings).map(r => String(r[0]).trim()).filter(String);
  // the selected year is already in full, so its short form is not sent again
  const otherYears = lite.filter(a => parseInt(a[1] ? a[1].slice(0, 4) : (/-(\d{4})-/.exec(a[0]) || [0, 0])[1], 10) !== year);
  return { records: full.records, budgets: full.budgets, lite: otherYears, year, offices, user, today,
    docStatus: DOC_STATUS, proposalTypes: PROPOSAL_TYPES, procTypes: PROC_TYPES, routeActions: ROUTE_ACTIONS,
    repeatTypes: REPEAT_TYPES, usersShared: !!linkedUsersId_() };
}

/** One record with full details, for opening a record of a year that is not loaded. */
function getRecord(token, id) {
  auth_(token);
  return oneRecord_(id);
}

/** Every row of the record sheets, with the child rows grouped by their parent ID. */
function loadAll_() {
  const group = (rows, col) => {
    const m = {};
    rows.forEach(r => (m[String(r[col])] = m[String(r[col])] || []).push(r));
    return m;
  };
  const recs = rows_(SHEETS.recs), prs = rows_(SHEETS.prs);
  return { recs, prs, prsByRec: group(prs, P['Record ID']), itemsByPr: group(rows_(SHEETS.sppmp), 0),
    routeByRec: group(rows_(SHEETS.routing), R['Record ID']) };
}

function fullRecord_(r, all) {
  const id = String(r[0]);
  return recordObj_(r, (all.prsByRec[id] || []).map(p => prObj_(p, all.itemsByPr[String(p[0])] || [])),
    (all.routeByRec[id] || []).map(routeObj_));
}

function oneRecord_(id) {
  const row = findRow_(SHEETS.recs, id);
  if (!row) throw new Error(`Record ${id} not found.`);
  const r = readRow_(SHEETS.recs, row);
  const prs = rows_(SHEETS.prs).filter(p => String(p[P['Record ID']]) === String(r[0]));
  const prIds = new Set(prs.map(p => String(p[0])));
  const items = rows_(SHEETS.sppmp).filter(x => prIds.has(String(x[0])));
  return recordObj_(r, prs.map(p => prObj_(p, items.filter(x => String(x[0]) === String(p[0])))),
    rows_(SHEETS.routing).filter(x => String(x[R['Record ID']]) === String(r[0])).map(routeObj_));
}

/** Year received, or the year in the ID (PROC-2027-00001) for imported rows without a date. Same rule as inYear() in Index.html. */
function yearOf_(r) {
  const d = iso_(r[1]);
  return parseInt(d ? d.slice(0, 4) : (/-(\d{4})-/.exec(String(r[0])) || [0, 0])[1], 10);
}

/**
 * Short form of a record, as an array to keep it small:
 * [id, received, office, title, status, repeatType, repeatOf, start, end, procType, dts, [[prId, prDts, 'A'|'C', prTitle], …]]
 * Index.html expands it (expandLite).
 */
function liteRow_(r, prRows) {
  return [String(r[0]), iso_(r[C['Date Received']]), String(r[C.Office]), String(r[C.Title]),
    String(r[C.Status] || 'Active'), String(r[C['Repeat Type']]), String(r[C['Repeat Of']]),
    iso_(r[C.Start]), iso_(r[C.End]), String(r[C['Procurement Type']]), String(r[C['DTS No.']]),
    prRows.map(p => [String(p[0]), String(p[P['DTS No.']]), String(p[P.Status]) === 'Cancelled' ? 'C' : 'A', String(p[P.Title])])];
}

/** Leaves out empty values ('' / null / false / []) to make the payload smaller; Index.html puts them back (fill). */
function slim_(v) {
  if (Array.isArray(v)) return v.map(slim_);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = {};
    Object.keys(v).forEach(k => {
      const x = v[k];
      if (x === '' || x === null || x === false || (Array.isArray(x) && !x.length)) return;
      o[k] = slim_(x);
    });
    return o;
  }
  return v;
}

/* ---------- data cache ---------- */
// CacheService keeps a value up to 100 KB, so big payloads are split into parts. The version in each key
// changes whenever the records change, which makes all older cached copies unused at once.
const CACHE_SECONDS = 6 * 60 * 60;

function dataVersion_() {
  const cache = CacheService.getScriptCache();
  return cache.get('ap_ver') || bumpDataVersion_();
}

/** Call after any change to the record sheets or the budgets. */
function bumpDataVersion_() {
  const v = Utilities.getUuid().slice(0, 8);
  CacheService.getScriptCache().put('ap_ver', v, CACHE_SECONDS);
  return v;
}

function cacheGetBig_(key) {
  const cache = CacheService.getScriptCache();
  const n = parseInt(cache.get(key + '_n'), 10);
  if (!n) return null;
  const keys = Array.from({ length: n }, (_, i) => key + '_' + i);
  const parts = cache.getAll(keys);
  if (keys.some(k => parts[k] == null)) return null; // a part was dropped from the cache
  return JSON.parse(keys.map(k => parts[k]).join(''));
}

function cachePutBig_(key, value) {
  try {
    const s = JSON.stringify(value), size = 90000, parts = {};
    let n = 0;
    for (let i = 0; i < s.length; i += size) parts[key + '_' + (n++)] = s.slice(i, i + size);
    parts[key + '_n'] = String(n || 1);
    if (!n) parts[key + '_0'] = s;
    CacheService.getScriptCache().putAll(parts, CACHE_SECONDS);
  } catch (e) {
    console.warn('Cache not saved: ' + e); // the app still works, only without the speed-up
  }
}

/** { at, requestedBy, reason, by } of a cancelled row (Procurements or PRs), or null */
function cancelObj_(r, col) {
  return String(r[col.Status]) !== 'Cancelled' ? null : {
    at: dt_(r[col['Cancelled At']]), requestedBy: String(r[col['Cancel Requested By']]),
    reason: String(r[col['Cancel Reason']]), by: String(r[col['Cancelled By']]),
  };
}

function recordObj_(r, prs, routing) {
  return {
    id: String(r[C['Record ID']]), received: iso_(r[C['Date Received']]), office: String(r[C.Office]),
    preparedBy: String(r[C['Prepared By']]), proposalType: String(r[C['Proposal Type']] || 'None'),
    withATC: isYes_(r[C['With ATC']]), procType: String(r[C['Procurement Type']]), title: String(r[C.Title]),
    venue: String(r[C.Venue]), start: iso_(r[C.Start]), end: iso_(r[C.End]), amount: Number(r[C.Amount]) || 0,
    details: String(r[C['Item Details']] || ''),
    proposalStatus: String(r[C['Proposal Status']]), atcStatus: String(r[C['ATC Status']]),
    dts: String(r[C['DTS No.']]), logbook: String(r[C['Logbook No.']]), status: String(r[C.Status] || 'Active'),
    cancel: cancelObj_(r, C),
    repeatType: String(r[C['Repeat Type']]), repeatOf: String(r[C['Repeat Of']]), repeatNote: String(r[C['Repeat Note']]),
    remarks: String(r[C.Remarks]), source: String(r[C.Source]),
    by: String(r[C['Encoded By']]), at: iso_(r[C['Encoded At']]), updatedBy: String(r[C['Updated By']]),
    prs, routing,
  };
}

function prObj_(p, itemRows) {
  return {
    id: String(p[P['PR ID']]), recordId: String(p[P['Record ID']]), dts: String(p[P['DTS No.']]),
    received: iso_(p[P['Date Received']]), prDate: iso_(p[P['PR Date']]), requisitioner: String(p[P.Requisitioner]),
    title: String(p[P.Title]), venue: String(p[P.Venue]), start: iso_(p[P.Start]), end: iso_(p[P.End]),
    amount: Number(p[P.Amount]) || 0, plan: String(p[P.Plan]), justification: String(p[P['SPPMP Justification']]),
    facility: String(p[P.Facility]), facilityJustification: String(p[P['Facility Justification']]),
    prStatus: String(p[P['PR Status']]), status: String(p[P.Status] || 'Active'), cancel: cancelObj_(p, P),
    replaces: String(p[P['Replaces PR']]), remarks: String(p[P.Remarks]), source: String(p[P.Source]),
    by: String(p[P['Encoded By']]), at: iso_(p[P['Encoded At']]), updatedBy: String(p[P['Updated By']]),
    items: itemRows.slice().sort((a, b) => a[1] - b[1]).map(x => ({ item: String(x[2]), amount: Number(x[3]) || 0 })),
  };
}

function routeObj_(x) {
  return { id: String(x[R['Entry ID']]), prId: String(x[R['PR ID']]), when: dt_(x[R['Date & Time']]),
    action: String(x[R.Action]), person: String(x[R.Person]), remarks: String(x[R.Remarks]), by: String(x[R['Encoded By']]) };
}

/* ======================== STEP 1: PROCUREMENT / PROPOSAL ======================== */

/**
 * Creates or updates a record (step 1).
 * p = { id?, received, office, preparedBy, proposalType, withATC, procType, title, details, venue, start, end, amount,
 *       proposalStatus, atcStatus, dts, logbook, remarks, repeatType?, repeatOf?, repeatNote? }
 * Returns { ok: true, record } or { ok: false, similar: [...] } when the title looks like an earlier
 * record of the same office and the encoder has not said yet whether it is a repeat.
 */
function saveProposal(token, p) {
  const user = auth_(token, ['Admin', 'Encoder']);
  const title = clean_(p.title);
  const received = p.received ? parseIso_(p.received) : new Date();
  if (!received) throw new Error('Invalid date received.');
  if (!p.office) throw new Error('Office is required.');
  if (!title) throw new Error('Title is required.');
  if (PROC_TYPES.indexOf(p.procType) < 0) throw new Error('Choose the kind of procurement.');
  if (PROPOSAL_TYPES.indexOf(p.proposalType) < 0) throw new Error('Choose Activity Proposal, Project Proposal or None.');

  const hasProposal = p.proposalType !== 'None';
  const amount = Number(p.amount) || 0;
  if (hasProposal) checkStatus_(p.proposalStatus, p.proposalType);
  if (p.withATC) checkStatus_(p.atcStatus, 'Authority to Conduct');
  if ((hasProposal || p.withATC) && amount <= 0) throw new Error('Amount is required.');

  // only events have a venue and date; hiring has the duration of the contract
  const isEvent = p.procType === 'Event', isHiring = p.procType === 'Hiring of Personnel';
  const start = isEvent || isHiring ? parseIso_(p.start) : null;
  const end = isEvent || isHiring ? parseIso_(p.end) || (isEvent ? start : null) : null;
  if (isEvent && !start) throw new Error('Date of the event is required.');
  if (isEvent && !clean_(p.venue)) throw new Error('Venue of the event is required.');
  if (isHiring && (!start || !end)) throw new Error('Duration of the contract (start and end) is required.');
  if (start && end < start) throw new Error('The end date is earlier than the start.');
  // what equipment / what is repaired (one item per line)
  const details = DETAIL_TYPES.indexOf(p.procType) >= 0 ? String(p.details || '').split('\n').map(clean_).filter(String).join('\n') : '';
  if (DETAIL_REQUIRED.indexOf(p.procType) >= 0 && !details) {
    throw new Error(p.procType === 'Repair' ? 'Enter what will be repaired.' : 'Enter what equipment.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let row, old = null, id = p.id;
    if (id) {
      row = findRow_(SHEETS.recs, id);
      if (!row) throw new Error(`Record ${id} not found.`);
      old = readRow_(SHEETS.recs, row);
      if (String(old[C.Status]) === 'Cancelled') throw new Error(`${id} is cancelled. Restore it first before editing.`);
    }
    // required, except on records imported from the 2026 file (many of them have none)
    if (!(old && old[C.Source])) {
      if (!clean_(p.preparedBy)) throw new Error('Prepared by is required.');
      if (!clean_(p.dts)) throw new Error('DTS No. is required.');
      if (!clean_(p.logbook)) throw new Error('Logbook No. (G#) is required.');
    }
    const all = rows_(SHEETS.recs);
    const repeatType = REPEAT_TYPES.indexOf(p.repeatType) >= 0 ? p.repeatType : '';
    // only a look-alike from the same office has to be answered (other offices are shown for information);
    // once the encoder has answered, the check is not needed
    if (!repeatType) {
      const similar = findSimilar_(all, title, p.id, p.office);
      if (similar.some(s => s.office === p.office)) return { ok: false, similar };
    }
    const repeatOf = repeatType && repeatType !== 'Different' ? String(p.repeatOf || '').trim() : '';
    if (repeatOf && !all.some(r => String(r[0]) === repeatOf)) throw new Error(`Record ${repeatOf} not found.`);
    if (repeatOf && repeatOf === p.id) throw new Error('A record cannot be a repeat of itself.');

    const now = new Date();
    if (!id) id = nextId_('PROC', SHEETS.recs, received);
    const r = old ? old.slice() : new Array(HEADERS.Procurements.length).fill('');
    r[C['Record ID']] = id; r[C['Date Received']] = received; r[C.Office] = p.office;
    r[C['Prepared By']] = clean_(p.preparedBy); r[C['Proposal Type']] = p.proposalType;
    r[C['With ATC']] = p.withATC ? 'Yes' : 'No'; r[C['Procurement Type']] = p.procType; r[C.Title] = title;
    r[C.Venue] = isEvent ? clean_(p.venue) : ''; r[C.Start] = start || ''; r[C.End] = end || '';
    r[C.Amount] = amount || ''; r[C['Item Details']] = details;
    r[C['Proposal Status']] = hasProposal ? p.proposalStatus : ''; r[C['ATC Status']] = p.withATC ? p.atcStatus : '';
    r[C['DTS No.']] = clean_(p.dts); r[C['Logbook No.']] = clean_(p.logbook);
    if (!old) r[C.Status] = 'Active';
    r[C['Repeat Type']] = repeatType; r[C['Repeat Of']] = repeatOf; r[C['Repeat Note']] = repeatType ? clean_(p.repeatNote) : '';
    r[C.Remarks] = clean_(p.remarks);
    if (!old) { r[C['Encoded By']] = user.username; r[C['Encoded At']] = now; }
    r[C['Updated At']] = now; r[C['Updated By']] = user.username;
    writeRow_(SHEETS.recs, old ? row : 0, r);
    bumpDataVersion_();

    audit_(user.username, old ? 'UPDATE_RECORD' : 'CREATE_RECORD', id,
      `${title}; ${p.procType}; ${p.proposalType}${p.withATC ? ' + ATC' : ''}${repeatType ? `; ${repeatType}${repeatOf ? ' of ' + repeatOf : ''}` : ''}`);
    return { ok: true, record: old ? oneRecord_(id) : recordObj_(r, [], []) };
  } finally {
    lock.releaseLock();
  }
}

/* ======================== STEP 2 + 3: PURCHASE REQUEST + SPPMP ITEMS ======================== */

/**
 * Creates or updates a Purchase Request of a record.
 * pr = { id?, recordId, dts, received, prDate, requisitioner, title, venue, start, end, amount,
 *        plan ('PPMP' | 'SPPMP' | ''), justification, facility ('Government' | 'Non-Government' | ''),
 *        facilityJustification, prStatus, replaces (PR ID of a cancelled PR), remarks }
 * The SPPMP items are not part of the PR form; they come later (saveSppmp).
 * Missing attachments do not stop the save; the PR shows as "Incomplete – return to office" (see prMissing in Index.html).
 * year = the year shown in the browser, whose budget summary is sent back.
 * Returns { ok: true, record, budgets, budget: { year, office, budget, used } }.
 */
function savePR(token, pr, year) {
  const user = auth_(token, ['Admin', 'Encoder']);
  const received = parseIso_(pr.received);
  if (!received) throw new Error('Date received of the PR is required.');
  const title = clean_(pr.title);
  if (!title) throw new Error('Title of the PR is required.');
  const amount = Number(pr.amount) || 0;
  if (amount <= 0) throw new Error('Amount of the PR is required.');
  checkStatus_(pr.prStatus, 'Purchase Request');
  const prDate = pr.prDate ? parseIso_(pr.prDate) : null;
  if (pr.prDate && !prDate) throw new Error('Invalid PR date.');
  const plan = PLANS.indexOf(pr.plan) >= 0 ? pr.plan : '';

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    rows_(SHEETS.recs); // needed in full for the budget anyway, so the row is found without another call
    const recRow = findRow_(SHEETS.recs, pr.recordId);
    if (!recRow) throw new Error(`Record ${pr.recordId} not found.`);
    const rec = readRow_(SHEETS.recs, recRow);
    if (String(rec[C.Status]) === 'Cancelled') throw new Error(`${rec[0]} is cancelled. Restore it first.`);
    const isEvent = String(rec[C['Procurement Type']]) === 'Event';
    const start = isEvent ? parseIso_(pr.start) : null, end = isEvent ? parseIso_(pr.end) || start : null;
    if (isEvent && (!start || !clean_(pr.venue))) throw new Error('Venue and date of the event are required.');
    if (start && end < start) throw new Error('The end date is earlier than the start.');
    const facility = isEvent && FACILITIES.indexOf(pr.facility) >= 0 ? pr.facility : '';

    const all = rows_(SHEETS.prs);
    let row = 0, old = null, id = pr.id;
    if (id) {
      row = findRow_(SHEETS.prs, id);
      if (!row) throw new Error(`PR ${id} not found.`);
      old = readRow_(SHEETS.prs, row);
      if (String(old[P.Status]) === 'Cancelled') throw new Error(`${id} is cancelled. Restore it first before editing.`);
      if (String(old[P['Record ID']]) !== String(rec[0])) throw new Error(`${id} belongs to another record.`);
    }
    const replaces = String(pr.replaces || '').trim();
    if (replaces) {
      const prev = all.find(x => String(x[0]) === replaces);
      if (!prev) throw new Error(`PR ${replaces} not found.`);
      if (replaces === id) throw new Error('A PR cannot replace itself.');
      if (String(prev[P.Status]) !== 'Cancelled') throw new Error(`${replaces} is not cancelled. Cancel it first, then link the new PR to it.`);
    }

    const now = new Date();
    if (!id) id = nextId_('PR', SHEETS.prs, received);
    const r = old ? old.slice() : new Array(HEADERS.PRs.length).fill('');
    r[P['PR ID']] = id; r[P['Record ID']] = String(rec[0]); r[P['DTS No.']] = clean_(pr.dts);
    r[P['Date Received']] = received; r[P['PR Date']] = prDate || ''; r[P.Requisitioner] = clean_(pr.requisitioner);
    r[P.Title] = title; r[P.Venue] = isEvent ? clean_(pr.venue) : ''; r[P.Start] = start || ''; r[P.End] = end || '';
    r[P.Amount] = amount; r[P.Plan] = plan;
    r[P['SPPMP Justification']] = plan === 'SPPMP' ? String(pr.justification || '').trim() : '';
    r[P.Facility] = facility;
    r[P['Facility Justification']] = facility === 'Non-Government' ? String(pr.facilityJustification || '').trim() : '';
    r[P['PR Status']] = pr.prStatus; r[P['Replaces PR']] = replaces; r[P.Remarks] = clean_(pr.remarks);
    if (!old) { r[P.Status] = 'Active'; r[P['Encoded By']] = user.username; r[P['Encoded At']] = now; }
    r[P['Updated At']] = now; r[P['Updated By']] = user.username;
    writeRow_(SHEETS.prs, row, r);
    bumpDataVersion_();

    audit_(user.username, old ? 'UPDATE_PR' : 'CREATE_PR', id, `${rec[0]}; DTS ${clean_(pr.dts) || '—'}; ${amount}; ` +
      `${plan || 'no PPMP/SPPMP'}${replaces ? '; replaces ' + replaces : ''}`);
    const prYear = received.getFullYear(), office = String(rec[C.Office]);
    const budgets = budgetSummary_(parseInt(year, 10) || prYear);
    const mine = (prYear === (parseInt(year, 10) || prYear) ? budgets : budgetSummary_(prYear)).find(b => b.office === office);
    return { ok: true, record: oneRecord_(String(rec[0])), budgets,
      budget: Object.assign({ year: prYear, office, budget: null, used: 0 }, mine || {}) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Step 3: the SPPMP of a PR. Encoded later than the PR: the papers go back to the office first and the
 * SPPMP is entered when they return. s = { justification, items: [{ item, amount }] }. Marks the PR as SPPMP
 * unless it already has a PPMP.
 */
function saveSppmp(token, prId, s) {
  const user = auth_(token, ['Admin', 'Encoder']);
  s = s || {};
  const items = (s.items || []).map(it => ({ item: clean_(it.item), amount: Number(it.amount) || 0 })).filter(it => it.item || it.amount);
  if (!items.length) throw new Error('Add at least one SPPMP item.');
  items.forEach((it, i) => {
    if (!it.item || it.amount <= 0) throw new Error(`SPPMP item ${i + 1}: description and amount are both required.`);
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    rows_(SHEETS.prs); // needed in full for the record sent back anyway
    const row = findRow_(SHEETS.prs, prId);
    if (!row) throw new Error(`PR ${prId} not found.`);
    const r = readRow_(SHEETS.prs, row);
    if (String(r[P.Status]) === 'Cancelled') throw new Error(`${prId} is cancelled. Restore it first.`);
    const recordId = String(r[P['Record ID']]), recRow = findRow_(SHEETS.recs, recordId);
    if (recRow && String(readRow_(SHEETS.recs, recRow)[C.Status]) === 'Cancelled') {
      throw new Error(`Record ${recordId} is cancelled. Restore it first.`);
    }
    if (String(r[P.Plan]) !== 'PPMP') r[P.Plan] = 'SPPMP'; // a PR with a PPMP keeps it
    r[P['SPPMP Justification']] = String(s.justification || '').trim();
    r[P['Updated At']] = new Date(); r[P['Updated By']] = user.username;
    writeRow_(SHEETS.prs, row, r);
    writeChildRows_(SHEETS.sppmp, String(prId), items.map((it, i) => [String(prId), i + 1, it.item, it.amount]), false);
    bumpDataVersion_();
    audit_(user.username, 'SAVE_SPPMP', prId, `${recordId}; ${items.length} item/s; ${items.reduce((a, it) => a + it.amount, 0)}`);
    return { ok: true, record: oneRecord_(recordId) };
  } finally {
    lock.releaseLock();
  }
}

/* ======================== CANCEL / RESTORE ======================== */

/**
 * Cancels or restores a record (kind 'record') or one PR (kind 'pr'). Cancelled rows are kept.
 * info = { date, time, requestedBy, reason }: when it was cancelled and who asked for it.
 * The PRs of a cancelled record (and cancelled PRs) are not counted in the budget.
 */
function setStatus(token, kind, id, status, info, year) {
  const user = auth_(token, ['Admin', 'Encoder']);
  if (['Active', 'Cancelled'].indexOf(status) < 0) throw new Error('Invalid status.');
  if (['record', 'pr'].indexOf(kind) < 0) throw new Error('Invalid kind.');
  info = info || {};
  const cancel = status === 'Cancelled';
  const reason = clean_(info.reason), requestedBy = clean_(info.requestedBy);
  const at = cancel ? parseDateTime_(info.date, info.time) : null;
  if (cancel && !requestedBy) throw new Error('Enter who asked for the cancellation.');
  if (cancel && !reason) throw new Error('Please enter the reason for cancelling.');
  if (cancel && !at) throw new Error('Enter the date and time of the cancellation.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    rows_(SHEETS.recs); rows_(SHEETS.prs); // needed in full for the budget anyway
    const name = kind === 'pr' ? SHEETS.prs : SHEETS.recs, col = kind === 'pr' ? P : C;
    const row = findRow_(name, id);
    if (!row) throw new Error(`${kind === 'pr' ? 'PR' : 'Record'} ${id} not found.`);
    const r = readRow_(name, row);
    if (String(r[col.Status] || 'Active') === status) throw new Error(`${id} is already ${status.toLowerCase()}.`);
    const recordId = kind === 'pr' ? String(r[P['Record ID']]) : id;
    if (kind === 'pr' && !cancel) {
      const recRow = findRow_(SHEETS.recs, recordId);
      if (recRow && String(readRow_(SHEETS.recs, recRow)[C.Status]) === 'Cancelled') {
        throw new Error(`Record ${recordId} is cancelled. Restore the record first.`);
      }
    }
    const note = cancel ? `CANCELLED ${dt_(at)} (asked by ${requestedBy}; encoded by ${user.username}): ${reason}`
      : `RESTORED ${dt_(new Date())} by ${user.username}${reason ? ': ' + reason : ''}`;
    r[col.Status] = status;
    r[col['Cancelled At']] = at || ''; r[col['Cancel Requested By']] = cancel ? requestedBy : '';
    r[col['Cancel Reason']] = cancel ? reason : ''; r[col['Cancelled By']] = cancel ? user.username : '';
    r[col.Remarks] = r[col.Remarks] ? r[col.Remarks] + ' | ' + note : note;
    r[col['Updated At']] = new Date(); r[col['Updated By']] = user.username;
    writeRow_(name, row, r);
    bumpDataVersion_();
    audit_(user.username, (cancel ? 'CANCEL_' : 'RESTORE_') + (kind === 'pr' ? 'PR' : 'RECORD'), id, note);
    return { ok: true, record: oneRecord_(recordId), budgets: budgetSummary_(parseInt(year, 10) || new Date().getFullYear()) };
  } finally {
    lock.releaseLock();
  }
}

/* ======================== STEP 4: ROUTING ======================== */

/** e = { recordId, prId ('' = the proposal), date, time, action, person, remarks } */
function addRouting(token, e) {
  const user = auth_(token, ['Admin', 'Encoder']);
  const when = parseDateTime_(e.date, e.time);
  if (!when) throw new Error('Enter the date and time.');
  if (ROUTE_ACTIONS.indexOf(e.action) < 0) throw new Error('Choose what happened.');
  const person = clean_(e.person);
  if (!person) throw new Error('Enter the name of the person.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (!findRow_(SHEETS.recs, e.recordId)) throw new Error(`Record ${e.recordId} not found.`);
    const prId = String(e.prId || '');
    if (prId && !rows_(SHEETS.prs).some(p => String(p[0]) === prId && String(p[P['Record ID']]) === e.recordId)) {
      throw new Error(`PR ${prId} is not part of ${e.recordId}.`);
    }
    const id = 'RT-' + Utilities.getUuid().slice(0, 8);
    writeRow_(SHEETS.routing, 0, [id, e.recordId, prId, when, e.action, person, clean_(e.remarks), user.username, new Date()]);
    bumpDataVersion_();
    audit_(user.username, 'ADD_ROUTING', e.recordId, `${prId || 'proposal'}: ${e.action} – ${person} (${dt_(when)})`);
    return { ok: true, record: oneRecord_(e.recordId) };
  } finally {
    lock.releaseLock();
  }
}

/** Removes a routing entry encoded by mistake (Admin, or the encoder who added it). */
function deleteRouting(token, entryId) {
  const user = auth_(token, ['Admin', 'Encoder']);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const row = findRow_(SHEETS.routing, entryId);
    if (!row) throw new Error('Routing entry not found.');
    const sh = sheet_(SHEETS.routing);
    const x = readRow_(SHEETS.routing, row);
    if (user.role !== 'Admin' && String(x[R['Encoded By']]) !== user.username) {
      throw new Error('Only the person who added this entry (or an Admin) can remove it.');
    }
    sh.deleteRow(row); forget_(SHEETS.routing);
    bumpDataVersion_();
    audit_(user.username, 'DELETE_ROUTING', String(x[R['Record ID']]),
      `${x[R['PR ID']] || 'proposal'}: ${x[R.Action]} – ${x[R.Person]} (${dt_(x[R['Date & Time']])})`);
    return { ok: true, record: oneRecord_(String(x[R['Record ID']])) };
  } finally {
    lock.releaseLock();
  }
}

/* ======================== BUDGET ======================== */

/** Sets (or, with a blank amount, removes) the budget of an office for a year. */
function saveBudget(token, year, office, amount) {
  const user = auth_(token, ['Admin', 'Encoder']);
  year = parseInt(year, 10);
  office = String(office || '').trim();
  if (!year || !office) throw new Error('Year and office are required.');
  const remove = amount === '' || amount == null;
  const value = Number(amount);
  if (!remove && !(value >= 0)) throw new Error('Enter the budget amount.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(SHEETS.budgets);
    const i = colValues_(SHEETS.budgets, 2).findIndex(b => parseInt(b[0], 10) === year && String(b[1]).trim() === office);
    if (remove) { if (i >= 0) sh.deleteRow(i + 2); }
    else if (i >= 0) sh.getRange(i + 2, 3, 1, 3).setValues([[value, user.username, new Date()]]);
    else sh.appendRow([year, office, value, user.username, new Date()]);
    forget_(SHEETS.budgets);
    bumpDataVersion_();
    audit_(user.username, 'SET_BUDGET', `${office} ${year}`, remove ? 'removed' : String(value));
    return { ok: true, budgets: budgetSummary_(year) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Budget, used amount and number of PRs per office for a year: [{ office, budget (null = not set), used, prs }].
 * Used = PRs received that year that are not cancelled (and whose record is not cancelled).
 */
function budgetSummary_(year, all) {
  const recs = all ? all.recs : rows_(SHEETS.recs), prs = all ? all.prs : rows_(SHEETS.prs);
  const officeOf = {}, cancelledRec = new Set();
  recs.forEach(r => {
    officeOf[String(r[0])] = String(r[C.Office]);
    if (String(r[C.Status]) === 'Cancelled') cancelledRec.add(String(r[0]));
  });
  const out = {};
  const get = o => (out[o] = out[o] || { office: o, budget: null, used: 0, prs: 0 });
  rows_(SHEETS.budgets).forEach(b => { if (parseInt(b[0], 10) === year) get(String(b[1]).trim()).budget = Number(b[2]) || 0; });
  prs.forEach(p => {
    const recId = String(p[P['Record ID']]);
    if (String(p[P.Status]) === 'Cancelled' || cancelledRec.has(recId)) return;
    const d = iso_(p[P['Date Received']]);
    if (parseInt(d ? d.slice(0, 4) : (/-(\d{4})-/.exec(String(p[0])) || [0, 0])[1], 10) !== year) return;
    const b = get(officeOf[recId] || '(no office)');
    b.used += Number(p[P.Amount]) || 0;
    b.prs++;
  });
  return Object.keys(out).map(k => out[k]);
}

function checkStatus_(status, doc) {
  if (DOC_STATUS.indexOf(status) < 0) throw new Error(`Choose the status of the ${doc}.`);
}

/* ======================== REPEAT CHECK ======================== */
// The same rules are in Index.html (similarity()), so the warning shown while typing
// matches the check done when saving. Keep both in sync.

const SIM_STOP = new Set(('THE AND FOR WITH FROM INTO ONTO THRU VIA ITS OUR ALL ETC PER ' +
  'ACTIVITY ACTIVITIES PROPOSAL REQUEST AUTHORITY CONDUCT CONDUCTING PURCHASE PROCUREMENT SUPPLY DELIVERY ' +
  'BFAR BUREAU FISHERIES AQUATIC RESOURCES CENTRAL OFFICE BATCH ' +
  'JAN JANUARY FEB FEBRUARY MAR MARCH APR APRIL MAY JUN JUNE JUL JULY AUG AUGUST SEP SEPT SEPTEMBER ' +
  'OCT OCTOBER NOV NOVEMBER DEC DECEMBER').split(' '));

/** "Training on Risk Management for CY 2026 (Batch 2)" -> ["TRAINING", "RISK", "MANAGEMENT"] */
function simTokens(text) {
  const out = [];
  String(text || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').split(' ').forEach(w => {
    if (w.length < 3 || /\d/.test(w) || SIM_STOP.has(w)) return;
    if (w.length > 4 && /[^S]S$/.test(w)) w = w.slice(0, -1); // WORKSHOPS -> WORKSHOP
    if (out.indexOf(w) < 0) out.push(w);
  });
  return out;
}

/**
 * Weight of each word: words found in many records (MEALS, VENUE, TRAINING) count little,
 * rare words (KYOCERA, HATCHERY) count a lot. docs = one token list per record.
 */
function simWeights(docs) {
  const df = {};
  docs.forEach(d => new Set(d).forEach(w => { df[w] = (df[w] || 0) + 1; }));
  const n = docs.length + 1, w = {};
  Object.keys(df).forEach(k => { w[k] = Math.log(n / df[k]); });
  w._unknown = Math.log(n);
  return w;
}

/** 0..1, how alike two token lists are; 0 when they are not alike enough to mention. */
function similarity(a, b, weights) {
  if (!a.length || !b.length) return 0;
  const wt = t => Math.max(weights[t] != null ? weights[t] : weights._unknown, 0.05);
  const setB = new Set(b);
  const common = a.filter(t => setB.has(t));
  if (!common.length) return 0;
  const wa = a.reduce((s, t) => s + wt(t), 0), wb = b.reduce((s, t) => s + wt(t), 0);
  const wc = common.reduce((s, t) => s + wt(t), 0);
  const dice = 2 * wc / (wa + wb);
  if (dice >= SIM_MIN) return dice;
  // a short title found inside a longer one, e.g. "Risk Management Training" in "Materials for the Risk Management Training"
  const inside = wc / Math.min(wa, wb);
  if (common.length >= 2 && inside >= 0.85) return Math.max(SIM_MIN, inside * 0.8);
  return 0;
}
const SIM_MIN = 0.6;

/** Records whose title or PR titles look like this title; same office first. */
function findSimilar_(allRows, title, excludeId, office) {
  const mine = simTokens(title);
  if (!mine.length) return [];
  const prTitles = {};
  rows_(SHEETS.prs).forEach(p => (prTitles[String(p[P['Record ID']])] = prTitles[String(p[P['Record ID']])] || []).push(String(p[P.Title])));
  const texts = allRows.map(r => [String(r[C.Title])].concat((prTitles[String(r[0])] || []).filter(t => t !== String(r[C.Title]))));
  const tokens = texts.map(list => list.map(simTokens));
  const weights = simWeights(tokens.map(list => [].concat.apply([], list)));
  const out = [];
  allRows.forEach((r, i) => {
    const id = String(r[0]);
    if (id === excludeId) return;
    let best = 0, what = '';
    tokens[i].forEach((tt, k) => { const s = similarity(mine, tt, weights); if (s > best) { best = s; what = texts[i][k]; } });
    if (best) out.push({ id, score: Math.round(best * 100), matched: what, title: String(r[C.Title]),
      office: String(r[C.Office]), received: iso_(r[C['Date Received']]), start: iso_(r[C.Start]),
      status: String(r[C.Status] || 'Active'), repeatOf: String(r[C['Repeat Of']]) });
  });
  return out.sort((a, b) => (b.office === office) - (a.office === office) || b.score - a.score ||
    b.received.localeCompare(a.received)).slice(0, 20);
}

/* ======================== HELPERS ======================== */

/*
 * Every call to the spreadsheet takes time (often more than all the other work of a request), so within
 * one request each sheet is opened once and read at most once. Global variables start empty on every
 * request (google.script.run call), so nothing is kept between requests.
 * Writes go through writeRow_ (or forget_), so what is kept stays the same as the sheet.
 */
const sheetObj_ = {}; // name -> Sheet
const rowCache_ = {}; // name -> every row below the header, blank ones too (index + 2 = row number)
const idCache_ = {};  // name -> the ID column only, when the whole sheet is not needed

function sheet_(name) {
  if (sheetObj_[name]) return sheetObj_[name];
  const usersId = name === SHEETS.users && linkedUsersId_();
  const sh = (usersId ? SpreadsheetApp.openById(usersId) : SpreadsheetApp.getActive()).getSheetByName(name);
  if (!sh) {
    throw new Error(usersId ? 'The Users sheet of the Travel Order System was not found. Run Procurement System > Use logins of Travel Order System again.'
      : `Sheet "${name}" not found. Open the spreadsheet and run Procurement System > Setup.`);
  }
  return sheetObj_[name] = sh;
}

/** All rows of a sheet as read (or written) during this request. One call: the used area, cut or padded to the known columns. */
function raw_(name) {
  if (!rowCache_[name]) {
    const width = HEADERS[name].length;
    rowCache_[name] = sheet_(name).getDataRange().getValues().slice(1).map(r => {
      if (r.length > width) return r.slice(0, width);
      while (r.length < width) r.push('');
      return r;
    });
  }
  return rowCache_[name];
}

/** One row (a copy, safe to change); from the rows already read when there are. */
function readRow_(name, row) {
  const c = rowCache_[name];
  if (c) return c[row - 2].slice();
  return withColumns_(name, () => sheet_(name).getRange(row, 1, 1, HEADERS[name].length).getValues()[0]);
}

/** Writes one row (row 0 = add at the end) and keeps the rows already read the same as the sheet. */
function writeRow_(name, row, r) {
  const sh = sheet_(name), c = rowCache_[name], ids = idCache_[name];
  withColumns_(name, () => { if (row) sh.getRange(row, 1, 1, r.length).setValues([r]); else sh.appendRow(r); });
  if (c) { if (row) c[row - 2] = r.slice(); else c.push(r.slice()); }
  if (ids) { if (row) ids[row - 2] = [r[0]]; else ids.push([r[0]]); }
}

/** Call after any other kind of write (several rows, deleted rows): the sheet is read again when needed. */
function forget_(name) {
  delete rowCache_[name];
  delete idCache_[name];
}

/**
 * A column added in a new version is missing in a sheet set up by an older version until Setup is run again.
 * Reading or writing past the last column fails; then the column is added and fn is tried again.
 * (Checking the width before every request would cost a call each time.)
 */
function withColumns_(name, fn) {
  try {
    return fn();
  } catch (e) {
    if (!addMissingColumns_(sheet_(name), name)) throw e;
    return fn();
  }
}

/** Adds the missing columns with their header; false when none are missing. */
function addMissingColumns_(sh, name) {
  const head = HEADERS[name], have = sh.getMaxColumns();
  if (have >= head.length) return false;
  sh.insertColumnsAfter(have, head.length - have);
  sh.getRange(1, have + 1, 1, head.length - have).setValues([head.slice(have)])
    .setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
  return true;
}

let linkedUsersId = null; // read once per request

/** ID of the Travel Order System spreadsheet whose Users sheet is shared, or '' when this app has its own. */
function linkedUsersId_() {
  if (linkedUsersId === null) linkedUsersId = PropertiesService.getScriptProperties().getProperty(USERS_FROM_PROP) || '';
  return linkedUsersId;
}

function rows_(name) {
  return raw_(name).filter(r => String(r[0]).trim() !== '');
}

function findRow_(name, id) {
  let ids = rowCache_[name] || idCache_[name];
  if (!ids) { // only the ID column, unless the whole sheet is already read
    const sh = sheet_(name), n = sh.getLastRow();
    ids = idCache_[name] = n < 2 ? [] : sh.getRange(2, 1, n - 1, 1).getValues();
  }
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]).trim().toLowerCase() === String(id).toLowerCase()) return i + 2;
  return 0;
}

/** First `cols` columns of a sheet (without header) — cheaper than reading every column. */
function colValues_(name, cols) {
  if (rowCache_[name]) return rowCache_[name];
  const sh = sheet_(name);
  const n = sh.getLastRow();
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, cols).getValues();
}

/**
 * Writes the child rows (first column = parent ID) of one parent, e.g. the SPPMP items of a PR.
 * Existing rows are overwritten in place (much faster than deleting rows); extra rows are appended,
 * leftover rows deleted.
 */
function writeChildRows_(name, parentId, newRows, isNew) {
  const sh = sheet_(name), width = HEADERS[name].length;
  const old = [];
  if (!isNew) colValues_(name, 1).forEach((r, i) => { if (String(r[0]) === parentId) old.push(i + 2); });
  const k = Math.min(old.length, newRows.length);
  if (k > 0 && old[k - 1] - old[0] === k - 1) sh.getRange(old[0], 1, k, width).setValues(newRows.slice(0, k));
  else for (let i = 0; i < k; i++) sh.getRange(old[i], 1, 1, width).setValues([newRows[i]]);
  if (newRows.length > k) sh.getRange(sh.getLastRow() + 1, 1, newRows.length - k, width).setValues(newRows.slice(k));
  for (let i = old.length - 1; i >= k; i--) sh.deleteRow(old[i]);
  forget_(name);
}

/**
 * Next ID for the year of the date received: PROC-2027-00001 (records), PR-2027-00001 (PRs), …
 * Numbering starts again at 00001 every year. Caller must hold the script lock.
 */
function nextId_(kind, sheetName, received) {
  const prefix = `${kind}-${Utilities.formatDate(received, TIMEZONE, 'yyyy')}-`;
  return prefix + String(nextNumber_(sheetName, prefix)).padStart(5, '0');
}

function nextNumber_(name, prefix) {
  let max = 0;
  colValues_(name, 1).forEach(r => {
    const s = String(r[0]);
    if (s.indexOf(prefix) === 0) max = Math.max(max, parseInt(s.slice(prefix.length), 10) || 0);
  });
  return max + 1;
}

function audit_(username, action, recordId, details) {
  try {
    sheet_(SHEETS.audit).appendRow([new Date(), username, action, recordId, String(details).slice(0, 500)]);
  } catch (e) {
    console.error('Audit log failed: ' + e);
  }
}

function clean_(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

function isYes_(v) {
  return v === true || String(v).trim().toLowerCase() === 'yes';
}

/*
 * Utilities.formatDate is slow when called for thousands of cells (loading all records). When the script
 * runs in the same time zone (appsscript.json "timeZone"), the date parts are read directly instead.
 */
let sameTimeZone_ = null;
function sameTz_() {
  if (sameTimeZone_ === null) sameTimeZone_ = Session.getScriptTimeZone() === TIMEZONE;
  return sameTimeZone_;
}
const pad2_ = n => (n < 10 ? '0' : '') + n;

function iso_(v) {
  if (!(v instanceof Date) || isNaN(v)) return '';
  if (!sameTz_()) return Utilities.formatDate(v, TIMEZONE, 'yyyy-MM-dd');
  return v.getFullYear() + '-' + pad2_(v.getMonth() + 1) + '-' + pad2_(v.getDate());
}

/** Date + time as 'yyyy-MM-dd HH:mm' */
function dt_(v) {
  if (!(v instanceof Date) || isNaN(v)) return '';
  if (!sameTz_()) return Utilities.formatDate(v, TIMEZONE, 'yyyy-MM-dd HH:mm');
  return iso_(v) + ' ' + pad2_(v.getHours()) + ':' + pad2_(v.getMinutes());
}

function parseIso_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

/** '2027-01-23' + '15:51' -> Date (time optional) */
function parseDateTime_(date, time) {
  const d = parseIso_(date);
  if (!d) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time || ''));
  if (m) d.setHours(+m[1], +m[2]);
  return d;
}
