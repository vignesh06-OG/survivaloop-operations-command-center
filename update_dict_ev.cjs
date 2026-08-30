const fs = require('fs');
const path = require('path');

const en = require('./src/lib/i18n/locales/en.json');
const mr = require('./src/lib/i18n/locales/mr.json');
const hi = require('./src/lib/i18n/locales/hi.json');
const ur = require('./src/lib/i18n/locales/ur.json');

const addEn = {
  "evidence.observed": "observed",
  "evidence.sev": "sev",
  "evidence.disclaimer": "Evidence is a claim, not truth. Severity is derived from the evidence type server-side."
};

const addHi = {
  "evidence.observed": "देखा गया",
  "evidence.sev": "गंभीरता",
  "evidence.disclaimer": "साक्ष्य एक दावा है, सत्य नहीं। गंभीरता साक्ष्य प्रकार सर्वर-पक्ष से ली गई है।"
};

const addMr = {
  "evidence.observed": "पाहिले",
  "evidence.sev": "गंभीरता",
  "evidence.disclaimer": "पुरावा हा एक दावा आहे, सत्य नाही. गंभीरता पुरावा प्रकारावरून ठरवली जाते."
};

const addUr = {
  "evidence.observed": "دیکھا گیا",
  "evidence.sev": "شدت",
  "evidence.disclaimer": "ثبوت ایک دعوی ہے، سچ نہیں۔ شدت ثبوت کی قسم سے اخذ کی جاتی ہے۔"
};

Object.assign(en, addEn);
Object.assign(hi, addHi);
Object.assign(mr, addMr);
Object.assign(ur, addUr);

const baseDir = 'src/lib/i18n/locales';
fs.writeFileSync(path.join(baseDir, 'en.json'), JSON.stringify(en, null, 2));
fs.writeFileSync(path.join(baseDir, 'hi.json'), JSON.stringify(hi, null, 2));
fs.writeFileSync(path.join(baseDir, 'mr.json'), JSON.stringify(mr, null, 2));
fs.writeFileSync(path.join(baseDir, 'ur.json'), JSON.stringify(ur, null, 2));

console.log('Dictionaries updated (EvidenceTimeline).');
