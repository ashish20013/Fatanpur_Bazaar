import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators';

/**
 * The public "close my account" page — `GET /v1/khata-band`.
 *
 * ⚠️ Why the API serves an HTML page at all. Google Play's User Data policy wants a web address
 * where someone can ask for their account and data to be deleted, reachable WITHOUT the app,
 * because the commonest case is a person who has already uninstalled it. The website is live and
 * is not to be touched, so the page lives here instead: one public route on the mobile app's own
 * backend, additive, and it cannot affect any existing endpoint.
 *
 * ⚠️ It deliberately does NOT delete anything by itself. There is no login here, so a form that
 * deleted an account by phone number would let anyone close a stranger's account by typing their
 * number. The page tells the person the two real ways to do it — inside the app, or by asking the
 * shop — which is exactly what the policy asks for ("a way to request deletion").
 *
 * Hindi first, because almost everyone reading it will be a village customer; English below for
 * the Play reviewer, who has to be able to read it too.
 */
@Controller()
export class AccountDeletionController {
  @Public()
  @Get('khata-band')
  page(@Res() res: Response): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(HTML);
  }
}

const SUPPORT = '9616038670';

/** One self-contained file: no CSS or font to fetch, so it opens on a 3G phone instantly. */
const HTML = `<!doctype html>
<html lang="hi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>खाता बंद करें — फतनपुर बाज़ार</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; padding:16px; background:#f6f8f6; color:#12211a;
         font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height:1.65; }
  main { max-width:620px; margin:0 auto; }
  .card { background:#fff; border:1px solid #dee7e1; border-radius:12px; padding:20px; margin-bottom:16px; }
  h1 { font-size:22px; margin:0 0 4px; color:#0c3323; }
  h2 { font-size:17px; margin:20px 0 8px; color:#11492f; }
  .sub { color:#48584f; font-size:14px; margin:0 0 20px; }
  ol, ul { padding-left:22px; margin:8px 0; }
  li { margin:6px 0; }
  .call { display:inline-block; background:#166b3c; color:#fff; text-decoration:none;
          padding:12px 18px; border-radius:8px; font-weight:600; margin-top:8px; }
  .note { background:#e6f4ea; border-radius:8px; padding:12px 14px; font-size:14px; margin-top:16px; }
  .en { border-top:1px solid #dee7e1; margin-top:24px; padding-top:16px; color:#48584f; font-size:14px; }
  .en h2 { color:#48584f; font-size:15px; }
  footer { text-align:center; color:#7a8a80; font-size:13px; padding:8px 0 24px; }
</style>
</head>
<body>
<main>
  <div class="card">
    <h1>खाता बंद करें</h1>
    <p class="sub">फतनपुर बाज़ार · Fatanpur Bazaar</p>

    <p>अपना खाता और उससे जुड़ी जानकारी हटवाने के लिए दो तरीके हैं:</p>

    <h2>1. ऐप से खुद बंद करें</h2>
    <ol>
      <li>ऐप खोलें और लॉगिन करें</li>
      <li>नीचे <strong>प्रोफ़ाइल</strong> पर जाएं</li>
      <li><strong>“खाता हमेशा के लिए बंद करें”</strong> पर दबाएं</li>
      <li>जो दिखेगा उसे पढ़कर पक्का करें — खाता तुरंत बंद हो जाएगा</li>
    </ol>

    <h2>2. हमें बताएं</h2>
    <p>ऐप फ़ोन से हटा दिया है, या खुद नहीं कर पा रहे हैं? हमें फ़ोन या WhatsApp करें —
       हम आपका खाता बंद कर देंगे। बस उस मोबाइल नंबर से बात करें जिससे खाता बना था।</p>
    <a class="call" href="tel:+91${SUPPORT}">📞 ${SUPPORT}</a>

    <h2>क्या-क्या हट जाएगा</h2>
    <ul>
      <li>आपका नाम, मोबाइल नंबर, ई-मेल और फ़ोटो</li>
      <li>सहेजे हुए सारे पते</li>
      <li>अपलोड की हुई डॉक्टर की पर्चियाँ</li>
      <li>सारे लॉगिन और सूचनाएं (notifications) बंद</li>
    </ul>

    <h2>क्या रह जाएगा, और क्यों</h2>
    <p>पुराने ऑर्डर और बिल का रिकॉर्ड दुकान के पास रहता है, क्योंकि हिसाब-किताब और टैक्स के
       नियम से उसे रखना ज़रूरी है। उसमें से आपका नाम और नंबर हटा दिया जाता है।
       ⚠️ वॉलेट में बचा पैसा खाता बंद होने पर वापस नहीं मिलता — पहले उसे इस्तेमाल कर लें।</p>

    <div class="note">
      खाता बंद होने के बाद उसी नंबर से दोबारा लॉगिन करेंगे तो <strong>नया खाता</strong> बनेगा —
      पुराना कुछ भी वापस नहीं आएगा।
    </div>

    <div class="en">
      <h2>English — request account deletion</h2>
      <p>To delete your Fatanpur Bazaar account and its data, either open the app and go to
         <strong>Profile → “खाता हमेशा के लिए बंद करें” (Close account permanently)</strong>, or
         call/WhatsApp <strong>+91 ${SUPPORT}</strong> from the mobile number the account was
         created with.</p>
      <p><strong>Deleted:</strong> name, mobile number, email, photo, saved addresses, uploaded
         prescriptions, and all sessions and push tokens.<br>
         <strong>Retained:</strong> past order and invoice records, as required by tax law, with
         your name and number removed from them. Any remaining wallet balance is forfeited.</p>
    </div>
  </div>
  <footer>फतनपुर बाज़ार · रानीगंज, प्रतापगढ़, उत्तर प्रदेश — 230301</footer>
</main>
</body>
</html>`;
