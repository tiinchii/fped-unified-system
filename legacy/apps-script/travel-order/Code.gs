/**
 * TRAVEL ORDER SYSTEM (web app)
 * Backend: the Google Sheet this script is bound to. Works across years — no yearly setup needed.
 *
 * Sheets (created by Setup):
 *   TravelOrders – one row per travel order
 *   Travelers    – one row per person per travel order (used for the overlap check)
 *   Personnel    – master list of names, so the same person is always spelled the same
 *   Users        – app logins (username + hashed password + role)
 *   AuditLog     – who did what, when
 *   Settings     – list of offices (column A)
 *
 * Roles: Admin (everything + manage users), Encoder (travel orders + personnel), Viewer (read only)
 */

const SHEETS = {
  orders: 'TravelOrders',
  travelers: 'Travelers',
  people: 'Personnel',
  users: 'Users',
  audit: 'AuditLog',
  settings: 'Settings',
};

const HEADERS = {
  TravelOrders: ['TO ID', 'Date Filed', 'Office', 'Destination', 'Purpose', 'Start Date', 'End Date',
    'DTS No.', 'TO No.', 'Status', 'Remarks', 'Overlap Reason', 'Encoded By', 'Encoded At', 'Updated At', 'Updated By', 'Reschedule History'],
  Travelers: ['TO ID', 'Person ID', 'Name', 'Start Date', 'End Date', 'Status'],
  Personnel: ['Person ID', 'Name', 'Office', 'Position', 'Active', 'Employment'],
  Users: ['Username', 'Full Name', 'Role', 'Active', 'Salt', 'Password Hash', 'Created At', 'Last Login'],
  AuditLog: ['Timestamp', 'Username', 'Action', 'Record ID', 'Details'],
  Settings: ['Offices'],
};

const DEFAULT_OFFICES = ['VOC', 'FRMD', 'LEGAL', 'NFDC', 'NFLD', 'FIMC', 'IFAD', 'FPHTD', 'NFFTC', 'ADJUDICATION',
  'FIQD', 'CFD', 'IFCU', 'NBFTC', 'PROPERTY', 'NMC', 'NIFTC', 'MFDC', 'NSTDC', 'FRLD', 'SEAWEEDS', 'NFARMC',
  'ADMIN/HRMS', 'IMEMS', 'NAPC', 'ADOTECH', 'HIPON', 'SAAD', 'BAC', 'GSS', 'ENGINEERING', 'ARS', 'FIDSSD',
  'FSP', 'FRPG', 'VMS', 'DO', 'LIBRARY', 'CASHIER', 'GAD', 'ADAS'];

const ROLES = ['Admin', 'Encoder', 'Viewer'];
const EMPLOYMENT = ['Permanent', 'COS'];
const TIMEZONE = 'Asia/Manila';
const SESSION_SECONDS = 8 * 60 * 60;   // login lasts 8 hours of inactivity
const SESSION_TOUCH_SECONDS = 5 * 60;  // the last-seen time of a login is saved at most every 5 minutes
const CACHE_MAX_SECONDS = 6 * 60 * 60; // CacheService keeps values 6 hours at most
const MAX_FAILED_LOGINS = 5;           // then the username is locked for 15 minutes
const HASH_ROUNDS = 200;
const BACKUP_FOLDER = 'Travel Order System Backups';
const BACKUPS_TO_KEEP = 24;            // 24 quarterly backups = 6 years
const BACKUP_MONTHS = [1, 4, 7, 10];   // every 3 months: Jan 1, Apr 1, Jul 1, Oct 1

/* ======================== SETUP / MENU ======================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Travel Order System')
    .addItem('1. Setup sheets + admin login', 'setup')
    .addItem('2. Import names & offices from 2026 sheet', 'importPersonnel')
    .addItem('3. Turn on backup every 3 months', 'installBackup')
    .addSeparator()
    .addItem('Backup now', 'backupNow')
    .addItem('Reset a user password', 'resetPasswordFromMenu')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  ss.setSpreadsheetTimeZone(TIMEZONE);
  Object.keys(HEADERS).forEach(name => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const head = HEADERS[name];
    sh.getRange(1, 1, 1, head.length).setValues([head])
      .setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  });
  ss.getSheetByName(SHEETS.orders).getRange('B:B').setNumberFormat('yyyy-mm-dd');
  ss.getSheetByName(SHEETS.orders).getRange('F:G').setNumberFormat('yyyy-mm-dd');
  ss.getSheetByName(SHEETS.travelers).getRange('D:E').setNumberFormat('yyyy-mm-dd');
  ss.getSheetByName(SHEETS.users).hideColumns(5, 2); // salt + hash

  const settings = ss.getSheetByName(SHEETS.settings);
  if (settings.getLastRow() < 2) {
    settings.getRange(2, 1, DEFAULT_OFFICES.length, 1).setValues(DEFAULT_OFFICES.map(o => [o]));
  }
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  if (!rows_(SHEETS.users).length) {
    const pw = askPassword_(ui, 'Create the first ADMIN login.\nUsername will be: admin\n\nEnter a password (at least 8 characters):');
    if (!pw) { ui.alert('Setup finished, but no admin was created. Run Setup again to create it.'); return; }
    sheet_(SHEETS.users).appendRow(newUserRow_('admin', 'Administrator', 'Admin', pw));
    audit_('admin', 'ADD_USER', 'admin', 'Created during setup');
  }
  ui.alert('Setup done.\n\nLogin: admin + the password you entered.\nNext: Deploy > New deployment > Web app.');
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

/**
 * One-time helper: copies the distinct names (with their most common office) and any
 * missing offices from the 2026 "TRAVEL ORDER 2026" sheet. Travel data is NOT copied.
 */
function importPersonnel() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Import names & offices', 'Paste the URL of the 2026 Travel Order Google Sheet:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const src = SpreadsheetApp.openByUrl(res.getResponseText().trim()).getSheetByName('TRAVEL ORDER 2026');
  if (!src) { ui.alert('Sheet "TRAVEL ORDER 2026" not found in that file.'); return; }
  const values = src.getRange(2, 2, src.getLastRow() - 1, 2).getValues(); // OFFICE, NAME

  const existing = new Set(rows_(SHEETS.people).map(r => normalizeName(r[1])));
  const found = {};
  const officesSeen = {};
  values.forEach(([office, name]) => {
    const o = String(office || '').trim().toUpperCase();
    if (o) officesSeen[o] = true;
    const key = normalizeName(name);
    if (!key || existing.has(key)) return;
    const f = found[key] = found[key] || { names: {}, offices: {} };
    const clean = String(name).replace(/\s+/g, ' ').trim().replace(/,$/, '');
    f.names[clean] = (f.names[clean] || 0) + 1;
    if (o) f.offices[o] = (f.offices[o] || 0) + 1;
  });

  const top = obj => Object.keys(obj).sort((a, b) => obj[b] - obj[a])[0] || '';
  let next = nextNumber_(SHEETS.people, 'P');
  const newRows = Object.keys(found).sort().map(key => [
    'P' + String(next++).padStart(4, '0'), top(found[key].names).toUpperCase(), top(found[key].offices), '', 'Yes']);
  if (newRows.length) {
    const sh = sheet_(SHEETS.people);
    sh.getRange(sh.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }

  const known = new Set(rows_(SHEETS.settings).map(r => String(r[0]).trim().toUpperCase()));
  const newOffices = Object.keys(officesSeen).filter(o => !known.has(o)).sort();
  if (newOffices.length) {
    const st = sheet_(SHEETS.settings);
    st.getRange(st.getLastRow() + 1, 1, newOffices.length, 1).setValues(newOffices.map(o => [o]));
  }
  audit_('(spreadsheet owner)', 'IMPORT_PERSONNEL', '', `${newRows.length} names, ${newOffices.length} offices`);
  ui.alert(`${newRows.length} name(s) and ${newOffices.length} new office(s) imported.\n\n` +
    `Please check the Personnel sheet for duplicates (e.g. "ABIGAIL M. JAVIER" and "ABIGAIL JAVIER") ` +
    `and set Active = No on the extra one.`);
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
    .setTitle('Travel Order System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // lets Google Sites embed the app
}

/* ======================== LOGIN ======================== */

function login(username, password) {
  username = String(username || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('fail_' + username) || 0);
  if (fails >= MAX_FAILED_LOGINS) throw new Error('Too many wrong attempts. Try again after 15 minutes.');

  const row = findRow_(SHEETS.users, username);
  const r = row ? sheet_(SHEETS.users).getRange(row, 1, 1, HEADERS.Users.length).getValues()[0] : null;
  const ok = r && isYes_(r[3]) && hash_(String(password || ''), String(r[4])) === String(r[5]);
  if (!ok) {
    cache.put('fail_' + username, String(fails + 1), 15 * 60);
    throw new Error('Wrong username or password.');
  }
  cache.remove('fail_' + username);
  sheet_(SHEETS.users).getRange(row, 8).setValue(new Date());

  const user = { username, name: String(r[1]), role: String(r[2]) };
  const token = Utilities.getUuid() + Utilities.getUuid();
  clearOldSessions_();
  saveSession_(token, Object.assign({ seen: Date.now() }, user));
  return { token, user };
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
  // checked against the Users sheet at most every 2 minutes (saveUser clears this cache)
  let info = cache.get('uok_' + user.username);
  if (!info) {
    const row = findRow_(SHEETS.users, user.username);
    const r = row && sheet_(SHEETS.users).getRange(row, 1, 1, 4).getValues()[0];
    info = JSON.stringify(r && isYes_(r[3]) ? { role: String(r[2]), name: String(r[1]) } : null);
    cache.put('uok_' + user.username, info, 120);
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
  sh.getRange(row, 5, 1, 2).setValues([[salt, hash_(newPw, salt)]]);
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
    CacheService.getScriptCache().remove('uok_' + username);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/* ======================== DATA ======================== */

/**
 * Data for one year. Travel orders from December of the previous year to January of the next
 * year are included too, so overlaps across New Year are still visible.
 */
function getData(token, year) {
  const user = auth_(token);
  const today = iso_(new Date());
  year = parseInt(year, 10) || parseInt(today.slice(0, 4), 10);
  const from = `${year - 1}-12-01`, to = `${year + 1}-01-31`;

  const years = new Set([parseInt(today.slice(0, 4), 10)]);
  const orders = [];
  rows_(SHEETS.orders).forEach(r => {
    const o = orderObj_(r);
    if (!o.start) return;
    years.add(parseInt(o.start.slice(0, 4), 10));
    if (o.start <= to && o.end >= from) orders.push(o);
  });
  const ids = new Set(orders.map(o => o.id));
  const travelers = rows_(SHEETS.travelers).filter(r => ids.has(String(r[0])))
    .map(r => ({ to: String(r[0]), pid: String(r[1]), name: String(r[2]) }));
  const people = rows_(SHEETS.people).map(r => ({
    id: String(r[0]), name: String(r[1]), office: String(r[2]), position: String(r[3]), active: isYes_(r[4]),
    employment: String(r[5] || ''),
  }));
  const offices = rows_(SHEETS.settings).map(r => String(r[0]).trim()).filter(String);
  return {
    orders, travelers, people, offices, user, today, year, window: { from, to },
    years: Array.from(years).sort((a, b) => b - a),
  };
}

function orderObj_(r) {
  return {
    id: String(r[0]), filed: iso_(r[1]), office: String(r[2]), dest: String(r[3]), purpose: String(r[4]),
    start: iso_(r[5]), end: iso_(r[6]), dts: String(r[7]), toNo: String(r[8]), status: String(r[9] || 'Active'),
    remarks: String(r[10]), reason: String(r[11]), by: String(r[12]), at: iso_(r[13]), updatedBy: String(r[15] || ''),
    resched: String(r[16] || '').split('\n').filter(String),
  };
}

/**
 * Creates or updates a travel order.
 * o = { id?, filed, office, dest, purpose, start, end, dts, toNo, remarks, travelers: [personId], reason? }
 * Returns { ok: true, id } or { ok: false, conflicts: [...] } when someone already has travel
 * on those dates and no overlap reason was given.
 */
function saveOrder(token, o) {
  const user = auth_(token, ['Admin', 'Encoder']);
  const start = parseIso_(o.start), end = parseIso_(o.end);
  const filed = o.filed ? parseIso_(o.filed) : new Date();
  if (!o.office || !String(o.dest).trim() || !String(o.purpose).trim()) throw new Error('Office, destination and purpose are required.');
  if (!start || !end) throw new Error('Start and end dates are required.');
  if (end < start) throw new Error('End date is earlier than start date.');

  const peopleById = {};
  colValues_(SHEETS.people, 2).forEach(r => { peopleById[String(r[0])] = String(r[1]); });
  const pids = Array.from(new Set(o.travelers || []));
  if (!pids.length) throw new Error('Add at least one traveler.');
  pids.forEach(id => { if (!peopleById[id]) throw new Error(`Unknown person ID ${id}.`); });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const conflicts = findConflicts_(pids, start, end, o.id);
    const reason = String(o.reason || '').trim();
    if (conflicts.length && !reason) return { ok: false, conflicts };

    const now = new Date();
    const ordersSh = sheet_(SHEETS.orders);
    let id = o.id;
    const data = [filed, o.office, String(o.dest).trim(), String(o.purpose).trim(), start, end,
      String(o.dts || '').trim(), String(o.toNo || '').trim(), 'Active', String(o.remarks || '').trim(),
      conflicts.length ? reason : ''];
    let full;

    if (id) {
      const row = findRow_(SHEETS.orders, id);
      if (!row) throw new Error(`Travel order ${id} not found.`);
      const old = ordersSh.getRange(row, 1, 1, HEADERS.TravelOrders.length).getValues()[0];
      if (String(old[9]) === 'Cancelled') throw new Error(`${id} is cancelled. Restore it first before editing.`);
      // changing the dates or the destination in the edit form also goes to the history
      let history = String(old[16] || '');
      if (iso_(old[5]) !== iso_(start) || iso_(old[6]) !== iso_(end) || String(old[3]) !== data[2]) {
        history = addReschedule_(history, old[5], old[6], start, end, user, 'changed in edit form', old[3], data[2]);
      }
      full = [id].concat(data, [old[12], old[13], now, user.username, history]);
      ordersSh.getRange(row, 1, 1, full.length).setValues([full]);
    } else {
      id = nextToId_(filed);
      full = [id].concat(data, [user.username, now, now, user.username, '']);
      ordersSh.appendRow(full);
    }
    const trRows = pids.map(pid => [id, pid, peopleById[pid], start, end, 'Active']);
    writeTravelers_(id, trRows, !o.id);

    const names = pids.map(pid => peopleById[pid]).join(', ');
    audit_(user.username, o.id ? 'UPDATE_TO' : 'CREATE_TO', id,
      `${iso_(start)} to ${iso_(end)}; ${names}${conflicts.length ? '; OVERLAP ALLOWED: ' + reason : ''}`);
    return { ok: true, id, order: orderObj_(full), travelers: trRows.map(r => ({ to: id, pid: r[1], name: r[2] })) };
  } finally {
    lock.releaseLock();
  }
}

/** Cancelled travel orders are kept but no longer count in the overlap check. */
function cancelOrder(token, id, reason) {
  const user = auth_(token, ['Admin', 'Encoder']);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return setOrderStatus_(user, id, 'Cancelled', `CANCELLED ${iso_(new Date())} by ${user.username}${reason ? ': ' + reason : ''}`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Makes a cancelled travel order active again. Like saving, it is refused when the travelers
 * already have other travel on those dates, unless a reason is given.
 */
function restoreOrder(token, id, reason) {
  const user = auth_(token, ['Admin', 'Encoder']);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const row = findRow_(SHEETS.orders, id);
    if (!row) throw new Error(`Travel order ${id} not found.`);
    const r = sheet_(SHEETS.orders).getRange(row, 1, 1, HEADERS.TravelOrders.length).getValues()[0];
    const pids = travelerRows_(id).map(x => String(x.values[1]));
    const conflicts = findConflicts_(pids, r[5], r[6], id);
    reason = String(reason || '').trim();
    if (conflicts.length && !reason) return { ok: false, conflicts };
    return setOrderStatus_(user, id, 'Active',
      `RESTORED ${iso_(new Date())} by ${user.username}${reason ? ': ' + reason : ''}`, conflicts.length ? reason : null);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Moves a travel order to new dates and/or a new place. The TO ID stays the same; the old dates
 * and place are kept in the Reschedule History column. Like saving, it is refused when the
 * travelers already have other travel on the new dates, unless an overlap reason is given.
 * newDest is optional (blank = keep the current destination).
 */
function rescheduleOrder(token, id, newStart, newEnd, reason, overlapReason, newDest) {
  const user = auth_(token, ['Admin', 'Encoder']);
  const start = parseIso_(newStart), end = parseIso_(newEnd);
  reason = String(reason || '').trim();
  if (!start || !end) throw new Error('New start and end dates are required.');
  if (end < start) throw new Error('End date is earlier than start date.');
  if (!reason) throw new Error('Please enter the reason for the change.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const row = findRow_(SHEETS.orders, id);
    if (!row) throw new Error(`Travel order ${id} not found.`);
    const sh = sheet_(SHEETS.orders);
    const r = sh.getRange(row, 1, 1, HEADERS.TravelOrders.length).getValues()[0];
    if (String(r[9]) === 'Cancelled') throw new Error(`${id} is cancelled. Restore it first before changing it.`);
    const dest = String(newDest || '').trim() || String(r[3]);
    const datesChanged = iso_(r[5]) !== iso_(start) || iso_(r[6]) !== iso_(end);
    if (!datesChanged && dest === String(r[3])) throw new Error('The new dates and place are the same as the current ones.');

    const rows = travelerRows_(id);
    // same dates = same overlaps as before, so the overlap check is only needed for new dates
    const conflicts = datesChanged ? findConflicts_(rows.map(x => String(x.values[1])), start, end, id) : [];
    overlapReason = String(overlapReason || '').trim();
    if (conflicts.length && !overlapReason) return { ok: false, conflicts };

    r[16] = addReschedule_(r[16], r[5], r[6], start, end, user, reason, r[3], dest);
    r[3] = dest; r[5] = start; r[6] = end;
    if (datesChanged) r[11] = conflicts.length ? overlapReason : '';
    r[14] = new Date(); r[15] = user.username;
    sh.getRange(row, 1, 1, r.length).setValues([r]);

    if (rows.length && datesChanged) {
      const sheet = sheet_(SHEETS.travelers);
      const first = rows[0].row, last = rows[rows.length - 1].row;
      const block = sheet.getRange(first, 4, last - first + 1, 2).getValues();
      rows.forEach(x => { block[x.row - first] = [start, end]; });
      sheet.getRange(first, 4, block.length, 2).setValues(block);
    }
    audit_(user.username, 'RESCHEDULE_TO', id, String(r[16]).split('\n').pop() +
      (conflicts.length ? '; OVERLAP ALLOWED: ' + overlapReason : ''));
    return { ok: true, order: orderObj_(r) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Adds one line to the Reschedule History text, e.g.
 * "2027-03-01 to 2027-03-03 → 2027-03-10 to 2027-03-12 · 2027-02-25 by admin · Venue moved · Place: Cebu City → Bohol".
 * The "Place:" part is only there when the destination changed.
 */
function addReschedule_(history, oldStart, oldEnd, start, end, user, reason, oldDest, newDest) {
  ensureHeader_(SHEETS.orders, 17);
  const place = oldDest != null && String(oldDest) !== String(newDest) ? ` · Place: ${oldDest} → ${newDest}` : '';
  const line = `${iso_(oldStart)} to ${iso_(oldEnd)} → ${iso_(start)} to ${iso_(end)} · ${iso_(new Date())} by ${user.username} · ${reason}${place}`;
  return history ? history + '\n' + line : line;
}

/** Sheets made before a column was added get its header the first time it is used. */
function ensureHeader_(name, col) {
  const cell = sheet_(name).getRange(1, col);
  if (!cell.getValue()) cell.setValue(HEADERS[name][col - 1]).setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
}

/** Caller must hold the script lock. */
function setOrderStatus_(user, id, status, note, overlapReason) {
  const row = findRow_(SHEETS.orders, id);
  if (!row) throw new Error(`Travel order ${id} not found.`);
  const sh = sheet_(SHEETS.orders);
  const r = sh.getRange(row, 1, 1, HEADERS.TravelOrders.length).getValues()[0];
  r[9] = status;
  r[10] = r[10] ? r[10] + ' | ' + note : note;
  if (overlapReason != null) r[11] = overlapReason;
  r[14] = new Date(); r[15] = user.username;
  sh.getRange(row, 1, 1, r.length).setValues([r]);

  const rows = travelerRows_(id);
  if (rows.length) {
    const sheet = sheet_(SHEETS.travelers);
    const first = rows[0].row, last = rows[rows.length - 1].row;
    const block = sheet.getRange(first, 6, last - first + 1, 1).getValues();
    rows.forEach(x => { block[x.row - first][0] = status; });
    sheet.getRange(first, 6, block.length, 1).setValues(block);
  }
  audit_(user.username, status === 'Cancelled' ? 'CANCEL_TO' : 'RESTORE_TO', id, note);
  return { ok: true, order: orderObj_(r) };
}

/** p = { id?, name, office, position, active, employment: 'Permanent' | 'COS' } */
function savePerson(token, p) {
  const user = auth_(token, ['Admin', 'Encoder']);
  const name = String(p.name || '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!normalizeName(name)) throw new Error('Please enter a valid name.');
  const employment = String(p.employment || '').trim();
  if (employment && EMPLOYMENT.indexOf(employment) < 0) throw new Error('Employment must be Permanent or COS.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(SHEETS.people);
    const dup = rows_(SHEETS.people).find(r => normalizeName(r[1]) === normalizeName(name) && String(r[0]) !== p.id);
    if (dup) throw new Error(`${dup[1]} already exists (${dup[0]}).`);

    ensureHeader_(SHEETS.people, 6);
    const data = [name, String(p.office || '').trim(), String(p.position || '').trim(), p.active === false ? 'No' : 'Yes', employment];
    let id = p.id;
    if (id) {
      const row = findRow_(SHEETS.people, id);
      if (!row) throw new Error(`Person ${id} not found.`);
      sh.getRange(row, 2, 1, data.length).setValues([data]);
      // keep the name on existing travel rows in sync
      const tr = sheet_(SHEETS.travelers);
      if (tr.getLastRow() > 1) {
        const vals = tr.getRange(2, 2, tr.getLastRow() - 1, 2).getValues();
        let changed = false;
        vals.forEach(r => { if (String(r[0]) === id && r[1] !== name) { r[1] = name; changed = true; } });
        if (changed) tr.getRange(2, 2, vals.length, 2).setValues(vals);
      }
      audit_(user.username, 'UPDATE_PERSON', id, data.join(' | '));
    } else {
      id = 'P' + String(nextNumber_(SHEETS.people, 'P')).padStart(4, '0');
      sh.appendRow([id].concat(data));
      audit_(user.username, 'ADD_PERSON', id, data.join(' | '));
    }
    return { ok: true, id, name, person: { id, name, office: data[1], position: data[2], active: data[3] === 'Yes', employment } };
  } finally {
    lock.releaseLock();
  }
}

/* ======================== OVERLAP CHECK ======================== */

/** Active travels of the given people that overlap [start, end], ignoring travel order excludeId. */
function findConflicts_(pids, start, end, excludeId) {
  const want = new Set(pids);
  const s = start.getTime(), e = end.getTime();
  const hits = rows_(SHEETS.travelers)
    .filter(r => want.has(String(r[1])) && String(r[0]) !== excludeId && String(r[5]) !== 'Cancelled'
      && r[3] instanceof Date && r[4] instanceof Date && r[3].getTime() <= e && r[4].getTime() >= s);
  if (!hits.length) return [];
  // destination/office only needed when there is a conflict to show
  const orders = {};
  colValues_(SHEETS.orders, 4).forEach(r => { orders[String(r[0])] = { dest: String(r[3]), office: String(r[2]) }; });
  return hits.map(r => ({ pid: String(r[1]), name: String(r[2]), to: String(r[0]), start: iso_(r[3]), end: iso_(r[4]),
    dest: (orders[String(r[0])] || {}).dest || '', office: (orders[String(r[0])] || {}).office || '' }));
}

/* ======================== HELPERS ======================== */

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error(`Sheet "${name}" not found. Open the spreadsheet and run Travel Order System > Setup.`);
  return sh;
}

function rows_(name) {
  const sh = sheet_(name);
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, HEADERS[name].length).getValues().filter(r => String(r[0]).trim() !== '');
}

function findRow_(name, id) {
  const sh = sheet_(name);
  const n = sh.getLastRow();
  if (n < 2) return 0;
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]).trim().toLowerCase() === String(id).toLowerCase()) return i + 2;
  return 0;
}

/** First `cols` columns of a sheet (without header) — cheaper than reading every column. */
function colValues_(name, cols) {
  const sh = sheet_(name);
  const n = sh.getLastRow();
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, cols).getValues();
}

/** Rows in Travelers that belong to a travel order: [{ row, values }] sorted by row. */
function travelerRows_(toId) {
  const sh = sheet_(SHEETS.travelers);
  const n = sh.getLastRow();
  if (n < 2) return [];
  const out = [];
  sh.getRange(2, 1, n - 1, 6).getValues().forEach((r, i) => { if (String(r[0]) === toId) out.push({ row: i + 2, values: r }); });
  return out;
}

/**
 * Writes the traveler rows of a travel order. Existing rows are overwritten in place
 * (much faster than deleting rows); extra rows are appended, leftover rows deleted.
 */
function writeTravelers_(toId, newRows, isNew) {
  const sh = sheet_(SHEETS.travelers);
  const old = isNew ? [] : travelerRows_(toId);
  const k = Math.min(old.length, newRows.length);
  const contiguous = k > 0 && old[k - 1].row - old[0].row === k - 1;
  if (contiguous) {
    sh.getRange(old[0].row, 1, k, 6).setValues(newRows.slice(0, k));
  } else {
    for (let i = 0; i < k; i++) sh.getRange(old[i].row, 1, 1, 6).setValues([newRows[i]]);
  }
  if (newRows.length > k) {
    sh.getRange(sh.getLastRow() + 1, 1, newRows.length - k, 6).setValues(newRows.slice(k));
  }
  for (let i = old.length - 1; i >= k; i--) sh.deleteRow(old[i].row);
}

/**
 * Next travel order ID for the year of the filing date: TO-2027-00001, TO-2027-00002, …
 * Numbering starts again at 00001 every year. Caller must hold the script lock.
 */
function nextToId_(filed) {
  const year = Utilities.formatDate(filed, TIMEZONE, 'yyyy');
  const prefix = `TO-${year}-`;
  const props = PropertiesService.getScriptProperties();
  const key = 'seq_TO_' + year;
  let n = parseInt(props.getProperty(key), 10);
  if (!n) n = nextNumber_(SHEETS.orders, prefix) - 1; // first TO of the year or counter lost
  n += 1;
  props.setProperty(key, String(n));
  return prefix + String(n).padStart(5, '0');
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

/** "Rinalyn B. Dumol," and "RINALYN B DUMOL" -> "RINALYN B DUMOL" */
function normalizeName(name) {
  const n = String(name || '').toUpperCase().replace(/[.,`'"]/g, ' ').replace(/\s+/g, ' ').trim();
  return /[A-Z]{2,}/.test(n) ? n : '';
}

function isYes_(v) {
  return v === true || String(v).trim().toLowerCase() === 'yes';
}

function iso_(v) {
  return v instanceof Date && !isNaN(v) ? Utilities.formatDate(v, TIMEZONE, 'yyyy-MM-dd') : '';
}

function parseIso_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
