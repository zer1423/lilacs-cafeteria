function parsePositiveInt(val) {
  if (typeof val === 'boolean' || val === null || val === undefined || val === '') {
    return null;
  }
  const num = Number(val);
  if (!Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

function parseNonNegativeMoney(val) {
  if (typeof val === 'boolean' || val === null || val === undefined || val === '') {
    return null;
  }
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }
  return Number(num.toFixed(2));
}

function cleanText(val) {
  if (typeof val !== 'string') return '';
  return val.trim();
}

function isValidPhone(phone) {
  // Accepts Philippine mobile/landline formats like 09175920609, 0917 592 0609, +639175920609
  const cleaned = cleanText(phone);
  return /^[+]?[0-9\s-]{7,20}$/.test(cleaned) && cleaned.replace(/\D/g, '').length >= 7;
}

function isValidEmail(email) {
  const cleaned = cleanText(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) && cleaned.length <= 100;
}

function isValidPaymentReference(ref) {
  const cleaned = cleanText(ref);
  return /^[A-Za-z0-9]{6,30}$/.test(cleaned);
}

function parseFutureDatetime(val) {
  const raw = cleanText(val);
  if (!raw) return null;
  // Accept ISO strings or "YYYY-MM-DD HH:MM:SS" / "YYYY-MM-DDTHH:MM"
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const dt = new Date(normalized);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getTime() <= Date.now()) return 'past';

  // Format as MySQL DATETIME "YYYY-MM-DD HH:MM:SS" in local time
  const pad = (n) => String(n).padStart(2, '0');
  const formatted = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  return formatted;
}

function parseBooleanFlag(val) {
  if (val === true || val === 1 || val === '1' || val === 'true') return 1;
  if (val === false || val === 0 || val === '0' || val === 'false') return 0;
  return null;
}

module.exports = {
  parsePositiveInt,
  parseNonNegativeMoney,
  cleanText,
  isValidPhone,
  isValidEmail,
  isValidPaymentReference,
  parseFutureDatetime,
  parseBooleanFlag
};
