const fs = require('fs');
const path = require('path');

const en = require('./src/lib/i18n/locales/en.json');
const mr = require('./src/lib/i18n/locales/mr.json');
const hi = require('./src/lib/i18n/locales/hi.json');
const ur = require('./src/lib/i18n/locales/ur.json');

const addEn = {
  "task.noTasks": "No tasks for this entity.",
  "task.pipelineTitle": "Intervention / Task pipeline",
  "task.notAssigned": "not assigned to you",
  "task.taskWord": "Task",
  "task.created": "created",
  "task.deadline": "deadline",
  "verification.titleText": "Execution proof & verification",
  "verification.worker": "worker",
  "verification.claimed": "claimed",
  "verification.received": "received",
  "verification.noGps": "no GPS",
  "verification.btnAuto": "Run automated checks",
  "verification.reviewReason": "review reason (required)",
  "verification.btnVerify": "Verify",
  "verification.btnReject": "Reject",
  "verification.disclaimer": "Proof is never auto-verified. Verification is a separate state from submission."
};

const addHi = {
  "task.noTasks": "इस इकाई के लिए कोई कार्य नहीं।",
  "task.pipelineTitle": "हस्तक्षेप / कार्य पाइपलाइन",
  "task.notAssigned": "आपको नहीं सौंपा गया",
  "task.taskWord": "कार्य",
  "task.created": "बनाया गया",
  "task.deadline": "समय सीमा",
  "verification.titleText": "निष्पादन प्रमाण और सत्यापन",
  "verification.worker": "कार्यकर्ता",
  "verification.claimed": "दावा किया गया",
  "verification.received": "प्राप्त हुआ",
  "verification.noGps": "कोई जीपीएस नहीं",
  "verification.btnAuto": "स्वचालित जाँच चलाएँ",
  "verification.reviewReason": "समीक्षा कारण (आवश्यक)",
  "verification.btnVerify": "सत्यापित करें",
  "verification.btnReject": "अस्वीकार करें",
  "verification.disclaimer": "प्रमाण कभी भी स्वतः सत्यापित नहीं होता है। सत्यापन प्रस्तुतीकरण से एक अलग स्थिति है।"
};

const addMr = {
  "task.noTasks": "या घटकासाठी कोणतीही कार्ये नाहीत.",
  "task.pipelineTitle": "हस्तक्षेप / कार्य पाइपलाइन",
  "task.notAssigned": "तुम्हाला नियुक्त केले नाही",
  "task.taskWord": "कार्य",
  "task.created": "तयार केले",
  "task.deadline": "अंतिम मुदत",
  "verification.titleText": "अंमलबजावणीचा पुरावा आणि पडताळणी",
  "verification.worker": "कामगार",
  "verification.claimed": "दावा केला",
  "verification.received": "प्राप्त झाले",
  "verification.noGps": "जीपीएस नाही",
  "verification.btnAuto": "स्वयंचलित तपासणी चालवा",
  "verification.reviewReason": "पुनरावलोकनाचे कारण (आवश्यक)",
  "verification.btnVerify": "सत्यापित करा",
  "verification.btnReject": "नाकारा",
  "verification.disclaimer": "पुरावा कधीही आपोआप सत्यापित होत नाही. पडताळणी ही सादरीकरणापेक्षा वेगळी स्थिती आहे."
};

const addUr = {
  "task.noTasks": "اس ہستی کے لئے کوئی کام نہیں۔",
  "task.pipelineTitle": "مداخلت / ٹاسک پائپ لائن",
  "task.notAssigned": "آپ کو تفویض نہیں کیا گیا",
  "task.taskWord": "ٹاسک",
  "task.created": "بنایا گیا",
  "task.deadline": "آخری تاریخ",
  "verification.titleText": "عمل درآمد کا ثبوت اور تصدیق",
  "verification.worker": "کارکن",
  "verification.claimed": "دعوی کیا گیا",
  "verification.received": "موصول ہوا",
  "verification.noGps": "کوئی جی پی ایس نہیں",
  "verification.btnAuto": "خودکار جانچ چلائیں",
  "verification.reviewReason": "جائزہ کی وجہ (ضروری)",
  "verification.btnVerify": "تصدیق کریں",
  "verification.btnReject": "مسترد کریں",
  "verification.disclaimer": "ثبوت کبھی بھی خودکار طور پر تصدیق شدہ نہیں ہوتا۔ تصدیق جمع کرانے سے ایک الگ حالت ہے۔"
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

console.log('Dictionaries updated (Tasks).');
