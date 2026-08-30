/**
 * SurvivaLoop — Deterministic mock AI provider for development and testing.
 *
 * This provider uses a simple state machine driven by keyword detection and
 * conversation length to simulate a realistic guided workflow:
 *
 *   1. Greet & ask for situation description.
 *   2. Request missing information (e.g., severity, what was done).
 *   3. Request photo evidence if none uploaded.
 *   4. Generate a structured draft report for review.
 *
 * It is fully deterministic — given the same inputs, it always produces the
 * same outputs. No network calls, no API keys required.
 *
 * SAFETY: This provider never invents facts. It only echoes back what the
 * worker has said and what the TaskContext contains. All generated text is
 * prefixed with "[AI Draft]" to make the provenance clear.
 */
import type { AiProvider, AiResponse, ChatMessage, TaskContext } from "./provider";

/** Localized greeting templates for a few key languages. Falls back to English. */
const GREETINGS: Record<string, string> = {
  en: "I'm your field assistant for task {entityId} ({interventionClassId}). The task is currently **{state}**. Can you describe what you see at the site?",
  hi: "मैं कार्य {entityId} ({interventionClassId}) के लिए आपका फील्ड सहायक हूँ। कार्य वर्तमान में **{state}** है। क्या आप बता सकते हैं कि साइट पर आपको क्या दिखाई दे रहा है?",
  mr: "मी कार्य {entityId} ({interventionClassId}) साठी तुमचा फील्ड सहाय्यक आहे. कार्य सध्या **{state}** आहे. तुम्ही साइटवर काय दिसते ते सांगू शकता का?",
  ta: "நான் பணி {entityId} ({interventionClassId}) க்கான உங்கள் கள உதவியாளர். பணி தற்போது **{state}** நிலையில் உள்ளது. தளத்தில் நீங்கள் என்ன பார்க்கிறீர்கள் என்று விவரிக்க முடியுமா?",
  bn: "আমি কাজ {entityId} ({interventionClassId}) এর জন্য আপনার মাঠ সহায়ক। কাজটি বর্তমানে **{state}** অবস্থায় আছে। আপনি সাইটে কী দেখছেন তা বর্ণনা করতে পারেন?",
  te: "నేను పని {entityId} ({interventionClassId}) కోసం మీ ఫీల్డ్ అసిస్టెంట్. పని ప్రస్తుతం **{state}** స్థితిలో ఉంది. సైట్‌లో మీరు ఏమి చూస్తున్నారో వివరించగలరా?",
  kn: "ನಾನು ಕಾರ್ಯ {entityId} ({interventionClassId}) ಗಾಗಿ ನಿಮ್ಮ ಕ್ಷೇತ್ರ ಸಹಾಯಕ. ಕಾರ್ಯವು ಪ್ರಸ್ತುತ **{state}** ಸ್ಥಿತಿಯಲ್ಲಿದೆ. ಸೈಟ್‌ನಲ್ಲಿ ನೀವು ಏನು ನೋಡುತ್ತಿದ್ದೀರಿ ಎಂದು ವಿವರಿಸಬಹುದೇ?",
  gu: "હું કાર્ય {entityId} ({interventionClassId}) માટે તમારો ફિલ્ડ સહાયક છું. કાર્ય હાલમાં **{state}** સ્થિતિમાં છે. તમે સાઇટ પર શું જુઓ છો તે વર્ણવી શકો છો?",
  pa: "ਮੈਂ ਕੰਮ {entityId} ({interventionClassId}) ਲਈ ਤੁਹਾਡਾ ਫੀਲਡ ਸਹਾਇਕ ਹਾਂ। ਕੰਮ ਵਰਤਮਾਨ ਵਿੱਚ **{state}** ਹੈ। ਕੀ ਤੁਸੀਂ ਦੱਸ ਸਕਦੇ ਹੋ ਕਿ ਸਾਈਟ 'ਤੇ ਤੁਹਾਨੂੰ ਕੀ ਦਿਖਾਈ ਦੇ ਰਿਹਾ ਹੈ?",
  ml: "ഞാൻ ടാസ്‌ക് {entityId} ({interventionClassId}) നായുള്ള നിങ്ങളുടെ ഫീൽഡ് അസിസ്റ്റന്റാണ്. ടാസ്‌ക് നിലവിൽ **{state}** ആണ്. സൈറ്റിൽ നിങ്ങൾ എന്താണ് കാണുന്നതെന്ന് വിവരിക്കാമോ?",
  or: "ମୁଁ କାର୍ଯ୍ୟ {entityId} ({interventionClassId}) ପାଇଁ ଆପଣଙ୍କ କ୍ଷେତ୍ର ସହାୟକ। କାର୍ଯ୍ୟଟି ବର୍ତ୍ତମାନ **{state}** ଅବସ୍ଥାରେ ଅଛି। ସାଇଟରେ ଆପଣ କ'ଣ ଦେଖୁଛନ୍ତି ବର୍ଣ୍ଣନା କରିପାରିବେ କି?",
  as: "মই কাম {entityId} ({interventionClassId}) ৰ বাবে আপোনাৰ ফিল্ড সহায়ক। কামটো বৰ্তমান **{state}** অৱস্থাত আছে। আপুনি চাইটত কি দেখিছে বৰ্ণনা কৰিব পাৰিবনে?",
  ur: "میں ٹاسک {entityId} ({interventionClassId}) کے لیے آپ کا فیلڈ اسسٹنٹ ہوں۔ ٹاسک فی الحال **{state}** ہے۔ کیا آپ بتا سکتے ہیں کہ سائٹ پر آپ کو کیا نظر آ رہا ہے؟",
};

const FOLLOW_UPS: Record<string, string> = {
  en: "Thanks for the details. How severe is the situation? What actions have you taken so far?",
  hi: "विवरण के लिए धन्यवाद। स्थिति कितनी गंभीर है? आपने अब तक क्या कदम उठाए हैं?",
  mr: "तपशीलांसाठी धन्यवाद. परिस्थिती किती गंभीर आहे? तुम्ही आतापर्यंत कोणती कारवाई केली आहे?",
  ta: "விவரங்களுக்கு நன்றி. நிலைமை எவ்வளவு தீவிரமானது? நீங்கள் இதுவரை என்ன நடவடிக்கைகள் எடுத்துள்ளீர்கள்?",
  ur: "تفصیلات کا شکریہ۔ صورتحال کتنی سنگین ہے؟ آپ نے اب تک کیا اقدامات کیے ہیں؟",
};

const PHOTO_REQUESTS: Record<string, string> = {
  en: "I need a photo of the site to complete the report. Please take a clear photo showing the current condition.",
  hi: "रिपोर्ट पूरी करने के लिए मुझे साइट की एक तस्वीर चाहिए। कृपया वर्तमान स्थिति दिखाते हुए एक स्पष्ट तस्वीर लें।",
  mr: "अहवाल पूर्ण करण्यासाठी मला साइटचा एक फोटो हवा आहे. कृपया सध्याची स्थिती दर्शवणारा एक स्पष्ट फोटो घ्या.",
  ta: "அறிக்கையை நிறைவு செய்ய எனக்கு தளத்தின் புகைப்படம் தேவை. தற்போதைய நிலையைக் காட்டும் தெளிவான புகைப்படம் எடுக்கவும்.",
  ur: "رپورٹ مکمل کرنے کے لیے مجھے سائٹ کی ایک تصویر چاہیے۔ براہ کرم موجودہ حالت دکھاتی ہوئی ایک واضح تصویر لیں۔",
};

const DRAFT_NOTES: Record<string, string> = {
  en: "[AI Draft] Site inspection completed for {entityId}. Intervention: {interventionClassId}. Worker observations: {observations}. Photo evidence attached.",
  hi: "[AI ड्राफ़्ट] {entityId} के लिए साइट निरीक्षण पूर्ण। हस्तक्षेप: {interventionClassId}। कार्यकर्ता टिप्पणियाँ: {observations}। फोटो प्रमाण संलग्न।",
  mr: "[AI मसुदा] {entityId} साठी साइट तपासणी पूर्ण. हस्तक्षेप: {interventionClassId}. कार्यकर्ता निरीक्षणे: {observations}. फोटो पुरावा संलग्न.",
  ur: "[AI مسودہ] {entityId} کے لیے سائٹ معائنہ مکمل۔ مداخلت: {interventionClassId}۔ کارکن مشاہدات: {observations}۔ فوٹو ثبوت منسلک۔",
};

function tmpl(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`{${k}}`, "g"), v);
  }
  return out;
}

function localized(table: Record<string, string>, locale: string): string {
  return table[locale] ?? table.en ?? "";
}

/** Extract user-provided observations from the conversation. */
function extractObservations(history: ChatMessage[]): string {
  const userMessages = history
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter((c) => c.length > 0);
  if (userMessages.length === 0) return "(no worker observations recorded)";
  // Combine but cap length to prevent injection-style abuse
  return userMessages.slice(0, 5).map((m) => m.slice(0, 200)).join("; ");
}

export class MockAiProvider implements AiProvider {
  async chat(
    history: ChatMessage[],
    context: TaskContext,
    locale: string,
  ): Promise<AiResponse> {
    const userMessages = history.filter((m) => m.role === "user");
    const turnCount = userMessages.length;

    const vars: Record<string, string> = {
      entityId: context.entityId,
      interventionClassId: context.interventionClassId,
      state: context.state,
    };

    // Turn 0: Worker opens the assistant → greet and ask for situation
    if (turnCount === 0) {
      return {
        kind: "text",
        text: tmpl(localized(GREETINGS, locale), vars),
      };
    }

    // Turn 1: Worker described the situation → follow up with severity / actions
    if (turnCount === 1) {
      return {
        kind: "text",
        text: localized(FOLLOW_UPS, locale),
      };
    }

    // Turn 2: If no photos uploaded yet, request a photo
    if (turnCount === 2 && context.existingPhotoRefs.length === 0) {
      return {
        kind: "request_upload",
        prompt: localized(PHOTO_REQUESTS, locale),
      };
    }

    // Turn 3+ (or turn 2 if photos exist): Generate draft report
    const observations = extractObservations(history);
    const noteVars = { ...vars, observations };
    return {
      kind: "draft_report",
      summary: tmpl(localized(DRAFT_NOTES, locale), noteVars),
      draft: {
        note: tmpl(localized(DRAFT_NOTES, locale), noteVars),
        photoRefs: context.existingPhotoRefs.length > 0
          ? context.existingPhotoRefs
          : ["ipfs://mock_photo_" + Date.now()],
        location: { lat: 12.97, lng: 77.39 },  // mock GPS
      },
    };
  }
}
