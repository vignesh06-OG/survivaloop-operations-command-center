const fs = require('fs');
const path = require('path');

const en = require('./src/lib/i18n/locales/en.json');
const mr = require('./src/lib/i18n/locales/mr.json');
const hi = require('./src/lib/i18n/locales/hi.json');
const ur = require('./src/lib/i18n/locales/ur.json');

const addEn = {
  "field.title": "Field Operations",
  "field.assignedTasks": "{count} Assigned Tasks",
  "field.logout": "Log out",
  "field.noDispatches": "No active dispatches.",
  "field.intervention": "Intervention:",
  "field.dispatched": "Dispatched",
  "field.slaDeadline": "SLA Deadline:",
  "field.back": "← Back",
  "field.currentStatus": "Current Status",
  "field.action": "Action",
  "field.slaStatus": "SLA Status",
  "field.executeAction": "Execute Action",
  "field.acceptDispatch": "ACCEPT DISPATCH",
  "field.startIntervention": "START INTERVENTION",
  "field.markCompleted": "MARK COMPLETED",
  "field.updating": "Updating...",
  "field.workflowComplete": "Workflow Complete",
  "field.workflowCompleteDesc": "This task is now with supervisors for verification or already resolved.",
  "field.captureEvidence": "Capture Evidence",
  "field.cameraApi": "Camera API (Simulated)",
  "field.cameraDesc": "1 photo reference will be attached to this proof.",
  "field.fieldNotes": "Field Notes",
  "field.describeOutcome": "Describe the outcome...",
  "field.submitProof": "SUBMIT PROOF",
  "field.uploading": "Uploading..."
};

const addHi = {
  "field.title": "फील्ड ऑपरेशंस",
  "field.assignedTasks": "{count} सौंपे गए कार्य",
  "field.logout": "लॉग आउट",
  "field.noDispatches": "कोई सक्रिय प्रेषण नहीं।",
  "field.intervention": "हस्तक्षेप:",
  "field.dispatched": "प्रेषित",
  "field.slaDeadline": "एसएलए समय सीमा:",
  "field.back": "← वापस",
  "field.currentStatus": "वर्तमान स्थिति",
  "field.action": "कार्रवाई",
  "field.slaStatus": "एसएलए स्थिति",
  "field.executeAction": "कार्रवाई निष्पादित करें",
  "field.acceptDispatch": "प्रेषण स्वीकार करें",
  "field.startIntervention": "हस्तक्षेप शुरू करें",
  "field.markCompleted": "पूरा हुआ चिह्नित करें",
  "field.updating": "अपडेट हो रहा है...",
  "field.workflowComplete": "कार्यप्रवाह पूरा हुआ",
  "field.workflowCompleteDesc": "यह कार्य अब सत्यापन के लिए पर्यवेक्षकों के पास है या पहले ही हल हो चुका है।",
  "field.captureEvidence": "साक्ष्य कैप्चर करें",
  "field.cameraApi": "कैमरा एपीआई (सिम्युलेटेड)",
  "field.cameraDesc": "इस प्रमाण के साथ 1 फोटो संदर्भ संलग्न किया जाएगा।",
  "field.fieldNotes": "फील्ड नोट्स",
  "field.describeOutcome": "परिणाम का वर्णन करें...",
  "field.submitProof": "प्रमाण सबमिट करें",
  "field.uploading": "अपलोड हो रहा है..."
};

const addMr = {
  "field.title": "फील्ड ऑपरेशन्स",
  "field.assignedTasks": "{count} नियुक्त कार्ये",
  "field.logout": "लॉग आउट",
  "field.noDispatches": "कोणतेही सक्रिय डिस्पॅच नाहीत.",
  "field.intervention": "हस्तक्षेप:",
  "field.dispatched": "डिस्पॅच केले",
  "field.slaDeadline": "एसएलए अंतिम मुदत:",
  "field.back": "← मागे",
  "field.currentStatus": "सद्यस्थिती",
  "field.action": "कृती",
  "field.slaStatus": "एसएलए स्थिती",
  "field.executeAction": "कृती करा",
  "field.acceptDispatch": "डिस्पॅच स्वीकारा",
  "field.startIntervention": "हस्तक्षेप सुरू करा",
  "field.markCompleted": "पूर्ण म्हणून चिन्हांकित करा",
  "field.updating": "अपडेट करत आहे...",
  "field.workflowComplete": "कार्यप्रवाह पूर्ण झाला",
  "field.workflowCompleteDesc": "हे कार्य आता पडताळणीसाठी पर्यवेक्षकांकडे आहे किंवा आधीच सोडवले गेले आहे.",
  "field.captureEvidence": "पुरावा कॅप्चर करा",
  "field.cameraApi": "कॅमेरा एपीआय (सिम्युलेटेड)",
  "field.cameraDesc": "या पुराव्याला १ फोटो संदर्भ जोडला जाईल.",
  "field.fieldNotes": "फील्ड नोट्स",
  "field.describeOutcome": "परिणामाचे वर्णन करा...",
  "field.submitProof": "पुरावा सादर करा",
  "field.uploading": "अपलोड करत आहे..."
};

const addUr = {
  "field.title": "فیلڈ آپریشنز",
  "field.assignedTasks": "{count} تفویض کردہ کام",
  "field.logout": "لاگ آؤٹ",
  "field.noDispatches": "کوئی فعال ترسیل نہیں۔",
  "field.intervention": "مداخلت:",
  "field.dispatched": "بھیجا گیا",
  "field.slaDeadline": "ایس ایل اے کی آخری تاریخ:",
  "field.back": "← واپس",
  "field.currentStatus": "موجودہ حالت",
  "field.action": "کارروائی",
  "field.slaStatus": "ایس ایل اے کی حالت",
  "field.executeAction": "کارروائی پر عمل کریں",
  "field.acceptDispatch": "ترسیل قبول کریں",
  "field.startIntervention": "مداخلت شروع کریں",
  "field.markCompleted": "مکمل کے طور پر نشان زد کریں",
  "field.updating": "اپ ڈیٹ ہو رہا ہے...",
  "field.workflowComplete": "ورک فلو مکمل",
  "field.workflowCompleteDesc": "یہ کام اب تصدیق کے لیے سپروائزرز کے پاس ہے یا پہلے ہی حل ہو چکا ہے۔",
  "field.captureEvidence": "ثبوت حاصل کریں",
  "field.cameraApi": "کیمرہ اے پی آئی (سمولیٹڈ)",
  "field.cameraDesc": "اس ثبوت کے ساتھ 1 تصویر کا حوالہ منسلک کیا جائے گا۔",
  "field.fieldNotes": "فیلڈ نوٹس",
  "field.describeOutcome": "نتیجہ بیان کریں...",
  "field.submitProof": "ثبوت جمع کرائیں",
  "field.uploading": "اپ لوڈ ہو رہا ہے..."
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

console.log('Dictionaries updated (FieldView).');
