/**
 * Error code catalogue (API_DOCUMENTATION §11). `message` is Hindi and safe to show directly.
 * `{n}`-style placeholders are filled by `formatMessage`.
 */
export const ERROR_CATALOG = {
  UNAUTHENTICATED: { http: 401, hi: 'लॉगिन करें', en: 'Please log in' },
  FORBIDDEN: { http: 403, hi: 'आपके पास इसकी अनुमति नहीं है', en: 'You do not have permission' },
  NOT_FOUND: { http: 404, hi: 'नहीं मिला', en: 'Not found' },
  GONE: { http: 410, hi: 'यह अब उपलब्ध नहीं है', en: 'No longer available' },
  VALIDATION_FAILED: { http: 400, hi: 'जानकारी सही नहीं है', en: 'Invalid input' },
  RATE_LIMITED: { http: 429, hi: 'बहुत ज़्यादा कोशिश — {n} मिनट बाद', en: 'Too many attempts — retry in {n} min' },
  OTP_INVALID: { http: 400, hi: 'OTP गलत है। {n} कोशिश बची हैं।', en: 'Wrong OTP. {n} attempts left.' },
  OTP_EXPIRED: { http: 400, hi: 'OTP की समय सीमा खत्म', en: 'OTP expired' },
  OTP_TOO_MANY: { http: 400, hi: 'बहुत बार गलत OTP — नया OTP मंगाएं', en: 'Too many wrong OTPs — request a new one' },
  OTP_COOLDOWN: { http: 429, hi: '1 मिनट बाद दोबारा भेजें', en: 'Retry after 1 minute' },
  OTP_SEND_FAILED: { http: 502, hi: 'OTP नहीं भेज पाए — थोड़ी देर बाद कोशिश करें', en: 'Could not send OTP' },
  /* Verifying failed on OUR side or the provider's — never the customer's typing. The second
     sentence is the point: he has just been refused, and needs to know his three attempts are
     intact so he tries the same OTP again instead of asking for a new one. */
  OTP_CHECK_FAILED: { http: 502, hi: 'OTP जाँच नहीं पाए — थोड़ी देर बाद फिर कोशिश करें। आपकी कोशिशें कम नहीं हुईं।', en: 'Could not check the OTP — please try again shortly. Your attempts were not used up.' },
  ACCOUNT_DISABLED: { http: 403, hi: 'खाता बंद है — सहायता से संपर्क करें', en: 'Account disabled — contact support' },
  /*
   * Two requests from the same browser tried to refresh at the same moment and this one lost. It is
   * NOT "your login is invalid" — the other request has already been handed fresh tokens, which are
   * on their way to the browser. Answering UNAUTHENTICATED here made the website delete the refresh
   * cookie, and whichever reply reached the browser last decided whether the person stayed logged
   * in: page loads, prefetches and background fetches race all the time, so people were thrown out
   * at random. A separate code lets the website leave the cookie alone.
   */
  REFRESH_RACE: { http: 409, hi: 'लॉगिन ताज़ा हो रहा है — दोबारा कोशिश करें', en: 'Session refresh in progress — retry' },
  STAFF_NOT_FOUND: { http: 401, hi: 'यह नंबर स्टाफ़ के रूप में दर्ज नहीं है', en: 'Not a staff account' },
  OUT_OF_SERVICE_AREA: { http: 422, hi: 'माफ़ करें — अभी हम {area} तक डिलीवरी नहीं करते', en: 'Sorry — we do not deliver to {area} yet' },
  STORE_CLOSED: { http: 422, hi: 'दुकान अभी बंद है — {time} पर खुलेगी', en: 'Store closed — opens at {time}' },
  MIN_ORDER_NOT_MET: { http: 422, hi: 'कम से कम ₹{n} का ऑर्डर करें', en: 'Minimum order is ₹{n}' },
  STOCK_INSUFFICIENT: { http: 422, hi: '{item} का सिर्फ {n} स्टॉक है', en: 'Only {n} of {item} left' },
  PRODUCT_UNAVAILABLE: { http: 422, hi: '{item} अभी उपलब्ध नहीं है', en: '{item} is unavailable' },
  QTY_LIMIT: { http: 422, hi: '{item} एक बार में ज़्यादा से ज़्यादा {n}', en: 'Max {n} of {item} per order' },
  PRESCRIPTION_REQUIRED: { http: 422, hi: 'पर्ची अपलोड करें', en: 'Upload a prescription' },
  PRESCRIPTION_INVALID: { http: 422, hi: 'यह पर्ची इस्तेमाल नहीं हो सकती', en: 'Prescription cannot be used' },
  PRESCRIPTION_PENDING: { http: 409, hi: 'पर्ची की जाँच बाकी है', en: 'Prescription review pending' },
  COD_LIMIT_EXCEEDED: { http: 422, hi: 'पहले ऑर्डर पर ₹{n} तक ही कैश ऑन डिलीवरी — या UPI से भुगतान करें', en: 'First order COD limit ₹{n} — or pay by UPI' },
  PAYMENT_METHOD_UNAVAILABLE: { http: 422, hi: 'यह भुगतान तरीका अभी उपलब्ध नहीं', en: 'Payment method unavailable' },
  PAYMENT_NOT_VERIFIED: { http: 409, hi: 'भुगतान की पुष्टि बाकी है', en: 'Payment not verified yet' },
  INVALID_STATE_TRANSITION: { http: 409, hi: '{from} से {to} नहीं हो सकता', en: 'Cannot move from {from} to {to}' },
  DELIVERY_OTP_INVALID: { http: 400, hi: 'OTP गलत है। ग्राहक से ऑर्डर पेज का 4 अंक का कोड पूछें। {n} कोशिश बची हैं।', en: 'Wrong OTP. Ask the customer for the 4-digit code. {n} attempts left.' },
  DELIVERY_OTP_LOCKED: { http: 429, hi: 'बहुत बार गलत OTP — एडमिन से संपर्क करें', en: 'Too many wrong OTPs — contact admin' },
  DUPLICATE_REQUEST: { http: 409, hi: 'यह ऑर्डर पहले ही बन चुका है', en: 'Order already created' },
  ORDER_IN_PROGRESS: { http: 409, hi: 'आपका पिछला ऑर्डर अभी बन रहा है', en: 'Your previous order is still being created' },
  SLOT_UNAVAILABLE: { http: 422, hi: 'यह समय उपलब्ध नहीं — दूसरा चुनें', en: 'Slot unavailable — choose another' },
  COUPON_INVALID: { http: 422, hi: '{reason}', en: '{reason}' },
  CONFLICT: { http: 409, hi: '{reason}', en: '{reason}' },
  BUSINESS_RULE: { http: 422, hi: '{reason}', en: '{reason}' },
  DUPLICATE_UTR: { http: 409, hi: 'यह UTR नंबर पहले इस्तेमाल हो चुका है', en: 'UTR already used' },
  PAYLOAD_TOO_LARGE: { http: 413, hi: 'फ़ाइल बहुत बड़ी है', en: 'File too large' },
  UNSUPPORTED_FILE: { http: 415, hi: 'यह फ़ाइल प्रकार नहीं चलेगा — JPG, PNG, WEBP या PDF भेजें', en: 'Unsupported file type' },
  CONFIRM_REQUIRED: { http: 409, hi: '{reason}', en: '{reason}' },
  INTERNAL: { http: 500, hi: 'कुछ गड़बड़ हो गई। दोबारा कोशिश करें।', en: 'Something went wrong. Please retry.' },
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export function formatMessage(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}
