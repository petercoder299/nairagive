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
function generateTicketCode(drawId, existingSet = new Set()) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const n = crypto.randomInt(0, 10000000000); // 0 .. 9,999,999,999
    const suffix = String(n).padStart(10, '0');
    const code = `${drawId}${suffix}`;
    if (!existingSet.has(code)) return code;
  }
  // Fallback: mix in random bytes
  const suffix = crypto.randomBytes(5).readUIntBE(0, 5) % 10000000000;
  return `${drawId}${String(suffix).padStart(10, '0')}`;
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
};
