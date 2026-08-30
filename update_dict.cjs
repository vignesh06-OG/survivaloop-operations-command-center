const fs = require('fs');
const path = require('path');

const en = require('./src/lib/i18n/locales/en.json');
const mr = require('./src/lib/i18n/locales/mr.json');
const hi = require('./src/lib/i18n/locales/hi.json');
const ur = require('./src/lib/i18n/locales/ur.json');

const additionsEn = {
  "why.whyAction": "Why this action",
  "why.freshness": "freshness",
  "why.reliability": "reliability",
  "why.qualityBar": "quality",
  "why.conflictDetected": "⚠ conflicting evidence detected",
  "why.noConflict": "no conflict",
  "why.qualifyingItems": "{count} qualifying item(s)",
  "why.qualNotConf": "quality ≠ confidence",
  "why.capacityFeas": "Capacity feasibility",
  "why.feasible": "Feasible — resources available",
  "why.infeasible": "Infeasible — resources insufficient",
  "why.short": "short",
  "why.ok": "ok",
  "why.notApplicable": "Not applicable (no actionable requirement).",
  "why.nextStep": "Next step:",
  "why.supervisorOverride": "⚠ This decision was overridden by a supervisor.",
  "evidence.signalLog": "Evidence Signal Log",
  "evidence.noSignals": "No signals received yet."
};

const additionsHi = {
  "why.whyAction": "यह कार्रवाई क्यों",
  "why.freshness": "ताजगी",
  "why.reliability": "विश्वसनीयता",
  "why.qualityBar": "गुणवत्ता",
  "why.conflictDetected": "⚠ परस्पर विरोधी साक्ष्य का पता चला",
  "why.noConflict": "कोई विरोध नहीं",
  "why.qualifyingItems": "{count} योग्य आइटम",
  "why.qualNotConf": "गुणवत्ता ≠ आत्मविश्वास",
  "why.capacityFeas": "क्षमता व्यवहार्यता",
  "why.feasible": "संभव - संसाधन उपलब्ध हैं",
  "why.infeasible": "असंभव - संसाधन अपर्याप्त हैं",
  "why.short": "कम",
  "why.ok": "ठीक",
  "why.notApplicable": "लागू नहीं (कोई कार्रवाई योग्य आवश्यकता नहीं)।",
  "why.nextStep": "अगला कदम:",
  "why.supervisorOverride": "⚠ इस निर्णय को एक पर्यवेक्षक द्वारा ओवरराइड किया गया था।",
  "evidence.signalLog": "साक्ष्य संकेत लॉग",
  "evidence.noSignals": "अभी तक कोई संकेत प्राप्त नहीं हुआ।"
};

const additionsMr = {
  "why.whyAction": "ही कृती का",
  "why.freshness": "ताजेपणा",
  "why.reliability": "विश्वसनीयता",
  "why.qualityBar": "गुणवत्ता",
  "why.conflictDetected": "⚠ परस्परविरोधी पुरावे सापडले",
  "why.noConflict": "कोणताही विरोध नाही",
  "why.qualifyingItems": "{count} पात्र घटक",
  "why.qualNotConf": "गुणवत्ता ≠ आत्मविश्वास",
  "why.capacityFeas": "क्षमता व्यवहार्यता",
  "why.feasible": "शक्य - संसाधने उपलब्ध आहेत",
  "why.infeasible": "अशक्य - संसाधने अपुरी आहेत",
  "why.short": "कमी",
  "why.ok": "ठीक",
  "why.notApplicable": "लागू नाही (कोणतीही कार्यवाही आवश्यक नाही).",
  "why.nextStep": "पुढची पायरी:",
  "why.supervisorOverride": "⚠ हा निर्णय पर्यवेक्षकाने मॅन्युअली बदलला आहे.",
  "evidence.signalLog": "पुरावा संकेत लॉग",
  "evidence.noSignals": "अद्याप कोणतेही संकेत प्राप्त झाले नाहीत."
};

const additionsUr = {
  "why.whyAction": "یہ کارروائی کیوں",
  "why.freshness": "تازگی",
  "why.reliability": "اعتبار",
  "why.qualityBar": "معیار",
  "why.conflictDetected": "⚠ متصادم ثبوت پایا گیا",
  "why.noConflict": "کوئی تصادم نہیں",
  "why.qualifyingItems": "{count} اہل آئٹمز",
  "why.qualNotConf": "معیار ≠ اعتماد",
  "why.capacityFeas": "صلاحیت کی فزیبلٹی",
  "why.feasible": "ممکن - وسائل دستیاب ہیں",
  "why.infeasible": "ناممکن - وسائل ناکافی ہیں",
  "why.short": "کم",
  "why.ok": "ٹھیک ہے",
  "why.notApplicable": "قابل اطلاق نہیں (کوئی قابل عمل ضرورت نہیں)۔",
  "why.nextStep": "اگلا قدم:",
  "why.supervisorOverride": "⚠ اس فیصلے کو سپروائزر نے اوور رائیڈ کیا تھا۔",
  "evidence.signalLog": "ثبوت سگنل لاگ",
  "evidence.noSignals": "ابھی تک کوئی سگنل موصول نہیں ہوا۔"
};

Object.assign(en, additionsEn);
Object.assign(hi, additionsHi);
Object.assign(mr, additionsMr);
Object.assign(ur, additionsUr);

const baseDir = 'src/lib/i18n/locales';
fs.writeFileSync(path.join(baseDir, 'en.json'), JSON.stringify(en, null, 2));
fs.writeFileSync(path.join(baseDir, 'hi.json'), JSON.stringify(hi, null, 2));
fs.writeFileSync(path.join(baseDir, 'mr.json'), JSON.stringify(mr, null, 2));
fs.writeFileSync(path.join(baseDir, 'ur.json'), JSON.stringify(ur, null, 2));

console.log('Dictionaries updated.');
