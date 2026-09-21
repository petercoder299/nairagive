// Core draw logic per deen.txt
// Draw ID: DDMMYYYY + letter A..X (A = 00:00-01:00 ... X = 23:00-00:00)
// Ticket: DRAWID + 10-digit zero-padded NON-SEQUENTIAL random suffix.
// Winner picking: seeded PRNG (SHA-256 -> mulberry32). NEVER Math.random.
const crypto = require('crypto');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function hourLetter(hour) {
  if (hour < 0 || hour > 23) throw new Error('hour out of range');
  return String.fromCharCode(65 + hour); // 0->A ... 23->X
}

function letterToHour(letter) {
  return letter.charCodeAt(0) - 65;
}

// Use server local time. For Africa/Lagos deployment set TZ=Africa/Lagos on Render.
function getDrawId(date = new Date()) {
  const dd = pad2(date.getDate());
  const mm = pad2(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  const letter = hourLetter(date.getHours());
  return `${dd}${mm}${yyyy}${letter}`;
}

function parseDrawId(drawId) {
  // e.g. 20092026A
  const m = /^(\d{2})(\d{2})(\d{4})([A-X])$/.exec(drawId);
  if (!m) throw new Error(`Invalid drawId: ${drawId}`);
  return {
    day: parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    year: parseInt(m[3], 10),
    letter: m[4],
    hour: letterToHour(m[4]),
  };
}

// Phases per spec:
// 00-50 -> entry_open, 51-52 -> drawing, 53-59 -> results
function getPhase(date = new Date()) {
  const min = date.getMinutes();
  if (min <= 50) return 'entry_open';
  if (min <= 52) return 'drawing';
  return 'results';
}

function getPhaseForDraw(drawId, date = new Date()) {
  // Only meaningful if date belongs to same draw hour; otherwise caller handles rollover.
  const currentDrawId = getDrawId(date);
  if (currentDrawId !== drawId) {
    // If date is in a later hour, that draw is closed/results.
    return 'results';
  }
  return getPhase(date);
}

// Non-sequential ticket suffix using crypto.randomInt (CSPRNG), uniqueness enforced by DB.
// digits: 10 for cash draws, 9 for OG (other) draws — never Math.random.
function generateTicketCode(drawId, existingSet = new Set(), digits = 10) {
  const space = 10 ** digits;
  for (let attempt = 0; attempt < 20; attempt++) {
    const n = crypto.randomInt(0, space);
    const suffix = String(n).padStart(digits, '0');
    const code = `${drawId}${suffix}`;
    if (!existingSet.has(code)) return code;
  }
  // Fallback: mix in random bytes
  const suffix = crypto.randomBytes(6).readUIntBE(0, 6) % space;
  return `${drawId}${String(suffix).padStart(digits, '0')}`;
}

// ---- Seeded winner picking (no Math.random) ----
// seed string -> uint32 via SHA-256 (first 4 bytes)
function seedToUint32(seedStr) {
  const h = crypto.createHash('sha256').update(seedStr, 'utf8').digest();
  return h.readUInt32BE(0);
}

// mulberry32 deterministic PRNG
function mulberry32(seedUint32) {
  let a = seedUint32 >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic Fisher-Yates shuffle using seeded PRNG, then take first k.
function seededPickWinners(tickets, { drawId, seedSecret, count = 1 }) {
  if (!tickets.length) return [];
  if (count >= tickets.length) return [...tickets];
  // Sort first so input order cannot bias result; seed commits to full ticket set.
  const sorted = [...tickets].sort((a, b) =>
    String(a.ticket_code || a).localeCompare(String(b.ticket_code || b))
  );
  const codes = sorted.map((t) => t.ticket_code || String(t)).join(',');
  const seedStr = `${drawId}|n=${sorted.length}|codes=${codes}|secret=${seedSecret}`;
  const rand = mulberry32(seedToUint32(seedStr));
  const arr = [...sorted];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

// Winner identity chain for display: public @username → telegram numeric ID
// → profile name. Never renders a bare "@" or "undefined".
function displayWinner(w) {
  const u = w || {};
  if (u.username) return '@' + u.username;
  if (u.telegram_id !== undefined && u.telegram_id !== null && String(u.telegram_id) !== '') {
    return String(u.telegram_id);
  }
  const name = u.first_name || u.firstName;
  if (name) return String(name);
  return 'unknown';
}

module.exports = {
  pad2,
  hourLetter,
  letterToHour,
  getDrawId,
  parseDrawId,
  getPhase,
  getPhaseForDraw,
  generateTicketCode,
  seedToUint32,
  mulberry32,
  seededPickWinners,
  displayWinner,
};
