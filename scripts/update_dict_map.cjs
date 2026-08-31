const fs = require('fs');
const path = require('path');

const en = require('./src/lib/i18n/locales/en.json');
const mr = require('./src/lib/i18n/locales/mr.json');
const hi = require('./src/lib/i18n/locales/hi.json');
const ur = require('./src/lib/i18n/locales/ur.json');

const addEn = {
  "map.drone": "DRONE",
  "map.delta": "DELTA",
  "map.enRoute": "EN ROUTE",
  "map.eta": "ETA",
  "map.timberRot": "Timber Rot",
  "map.sector": "SECTOR 4",
  "map.lat": "LAT",
  "map.lng": "LNG",
  "map.myLocation": "my location",
  "map.layers": "layers",
  "map.zoomIn": "zoom in",
  "map.zoomOut": "zoom out",
  "map.legend": "LEGEND",
  "map.healthy": "HEALTHY",
  "map.stressed": "STRESSED",
  "map.critical": "CRITICAL",
  "map.experimental": "3D OPERATIONS MAP · EXPERIMENTAL"
};

const addHi = {
  "map.drone": "ड्रोन",
  "map.delta": "डेल्टा",
  "map.enRoute": "रास्ते में",
  "map.eta": "ईटीए",
  "map.timberRot": "लकड़ी की सड़न",
  "map.sector": "सेक्टर 4",
  "map.lat": "अक्षांश",
  "map.lng": "देशांतर",
  "map.myLocation": "मेरा स्थान",
  "map.layers": "परतें",
  "map.zoomIn": "ज़ूम इन",
  "map.zoomOut": "ज़ूम आउट",
  "map.legend": "संकेत",
  "map.healthy": "स्वस्थ",
  "map.stressed": "तनावग्रस्त",
  "map.critical": "गंभीर",
  "map.experimental": "3D संचालन मानचित्र · प्रायोगिक"
};

const addMr = {
  "map.drone": "ड्रोन",
  "map.delta": "डेल्टा",
  "map.enRoute": "वाटेत",
  "map.eta": "ईटीए",
  "map.timberRot": "लाकडाची सड",
  "map.sector": "सेक्टर 4",
  "map.lat": "अक्षांश",
  "map.lng": "रेखांश",
  "map.myLocation": "माझे स्थान",
  "map.layers": "स्तर",
  "map.zoomIn": "झूम इन",
  "map.zoomOut": "झूम आउट",
  "map.legend": "सूची",
  "map.healthy": "निरोगी",
  "map.stressed": "तणावग्रस्त",
  "map.critical": "गंभीर",
  "map.experimental": "3D ऑपरेशन्स नकाशा · प्रायोगिक"
};

const addUr = {
  "map.drone": "ڈرون",
  "map.delta": "ڈیلٹا",
  "map.enRoute": "راستے میں",
  "map.eta": "ای ٹی اے",
  "map.timberRot": "لکڑی کی سڑن",
  "map.sector": "سیکٹر 4",
  "map.lat": "طول",
  "map.lng": "عرض",
  "map.myLocation": "میرا مقام",
  "map.layers": "تہیں",
  "map.zoomIn": "زوم ان",
  "map.zoomOut": "زوم آؤٹ",
  "map.legend": "علامات",
  "map.healthy": "صحت مند",
  "map.stressed": "دباؤ کا شکار",
  "map.critical": "انتہائی شدید",
  "map.experimental": "3D آپریشنز کا نقشہ · تجرباتی"
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

console.log('Dictionaries updated (MapCanvas).');
