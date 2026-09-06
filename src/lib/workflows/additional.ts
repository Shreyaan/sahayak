import type { WorkflowDefinition } from '../workflow';
import type { Localized } from '../locale';

const l = (en: string, hi: string): Localized => ({ en, hi });
const recordOnly = { state: 'needs-you' as const, reply: l('Record only an update you actually received. Nothing has been submitted by Sahayak.', 'केवल मिला हुआ वास्तविक जवाब दर्ज करें। सहायक ने कुछ जमा नहीं किया है।') };

/** Source notes and verification limits live beside the seed metadata. No simulated responses or timers. */
export const aadhaarUpdate: WorkflowDefinition = {
  id: 'aadhaar-update', authoredBy: 'bundled', firstNodeId: 'aadhaar-status',
  title: l('Aadhaar update stuck', 'आधार अपडेट अटका है'),
  subtitle: l('Understand a pending or rejected update before applying again', 'दोबारा आवेदन से पहले लंबित या अस्वीकृत अपडेट समझें'),
  nodes: [
    {
      id: 'aadhaar-status', type: 'online-action',
      title: l('Find the exact update status', 'अपडेट की सही स्थिति जानें'),
      detail: l('Keep the acknowledgement from your update request. Open myAadhaar and choose Check Aadhaar Update Status, following the identifiers requested there. Enter identity details only on the official site. If the site fails or you cannot find the receipt, UIDAI helpline 1947 can help you understand the next step.', 'अपडेट की पावती पास रखें। myAadhaar पर Check Aadhaar Update Status खोलें और वहाँ माँगी जानकारी दें। पहचान की जानकारी केवल सरकारी साइट पर भरें। साइट न खुले या पावती न मिले तो अगला कदम समझने के लिए UIDAI की 1947 हेल्पलाइन से मदद लें।'),
      ask: l('No result yet? Use the link or helpline first; your place stays saved.', 'अभी नतीजा नहीं मिला? पहले लिंक या हेल्पलाइन की मदद लें; आपका कदम सुरक्षित रहेगा।'),
      link: { url: 'https://myaadhaar.uidai.gov.in/', action: l('Open myAadhaar status services', 'myAadhaar स्थिति सेवाएँ खोलें'), collect: l('Keep the status wording, request date and any rejection reason. Do not enter Aadhaar numbers or OTPs in Sahayak.', 'स्थिति के शब्द, अनुरोध की तारीख और अस्वीकृति का कारण रखें। सहायक में आधार नंबर या OTP न भरें।') },
      visit: {
        office: l('UIDAI helpline: 1947', 'UIDAI हेल्पलाइन: 1947'),
        why: l('Use this if the status is unclear or you cannot access it.', 'स्थिति समझ न आए या दिख न रही हो तो यहाँ मदद लें।'),
        carry: [l('Your update acknowledgement and request date, if available', 'अपडेट की पावती और अनुरोध की तारीख, यदि उपलब्ध हो')],
        script: l('I requested an Aadhaar update. Please help me check its status and understand any rejection reason before I apply again.', 'मैंने आधार अपडेट का अनुरोध किया था। दोबारा आवेदन से पहले उसकी स्थिति और अस्वीकृति का कारण समझने में मदद करें।'),
        expect: l('Ask what applies to your request; do not assume every update follows the same correction process.', 'अपने अनुरोध पर लागू प्रक्रिया पूछें; सभी अपडेट का सुधार एक जैसा न मानें।'),
        collect: l('The answer and interaction reference, if issued', 'जवाब और जारी हुआ बातचीत का संदर्भ नंबर'),
      },
      onConfirm: recordOnly,
      report: { prompt: l('Record what the status page or helpline said', 'स्थिति पेज या हेल्पलाइन का जवाब दर्ज करें'), options: [
        { id: 'rejected', label: l('The update was rejected', 'अपडेट अस्वीकार हुआ'), reply: l('Rejection recorded. Find the reason before another application.', 'अस्वीकृति दर्ज है। दोबारा आवेदन से पहले कारण जानें।'), outcome: { state: 'blocked', opens: 'aadhaar-help', note: l('Citizen reported an update rejection', 'नागरिक ने अपडेट अस्वीकृति दर्ज की'), reply: l('Prepare to ask UIDAI about this rejection.', 'इस अस्वीकृति पर UIDAI से पूछने की तैयारी करें।') } },
        { id: 'pending', label: l('It is pending, or I need help finding the result', 'लंबित है या नतीजा खोजने में मदद चाहिए'), reply: l('Pending does not mean rejected. Keep the same request reference for follow-up.', 'लंबित होने का मतलब अस्वीकृत नहीं है। आगे पूछने के लिए यही अनुरोध संदर्भ रखें।'), outcome: { state: 'blocked', opens: 'aadhaar-help', note: l('Update not yet confirmed', 'अपडेट की पुष्टि नहीं हुई'), reply: l('Check the next-step guidance before applying again.', 'दोबारा आवेदन से पहले अगले कदम का मार्गदर्शन देखें।') } },
        { id: 'updated', label: l('The update is shown as completed', 'अपडेट पूरा दिख रहा है'), reply: l('Check that the updated details are actually correct.', 'जाँचें कि अपडेट की जानकारी वास्तव में सही है।'), outcome: { state: 'done', opens: 'aadhaar-confirm', reply: l('Verify the actual result.', 'वास्तविक नतीजा जाँचें।') } },
      ] },
    },
    {
      id: 'aadhaar-help', type: 'document-correction',
      title: l('Ask for the reason and the correct next step', 'कारण और सही अगला कदम पूछें'),
      detail: l('For a rejection, call 1947 to understand the reason before another update request. UIDAI says updates can take up to 90 days; if yours is older, seek help through 1947. Sahayak cannot approve documents, change Aadhaar details or promise a completion date.', 'अस्वीकृति होने पर नया अपडेट अनुरोध करने से पहले 1947 पर कारण समझें। UIDAI के अनुसार अपडेट में 90 दिन तक लग सकते हैं; अधिक समय हो तो 1947 से मदद लें। सहायक दस्तावेज़ मंजूर नहीं कर सकता, आधार नहीं बदलता और पूरा होने की तारीख का वादा नहीं करता।'),
      ask: l('Ask what correction is needed, where it must be made and which documents apply to your request.', 'पूछें कि कौन सा सुधार चाहिए, कहाँ होगा और आपके अनुरोध के लिए कौन से दस्तावेज़ लागू हैं।'),
      link: { url: 'https://uidai.gov.in/en/contact-support.html', action: l('UIDAI contact and support', 'UIDAI संपर्क और सहायता'), collect: l('Record the exact advice and interaction number. A complaint acknowledgement is not an approved update.', 'सही सलाह और बातचीत नंबर दर्ज करें। शिकायत की पावती अपडेट की मंजूरी नहीं है।') },
      onConfirm: recordOnly,
      report: { prompt: l('Record the assistance you received', 'मिली हुई सहायता दर्ज करें'), options: [
        { id: 'guidance-received', label: l('I received guidance or an interaction reference', 'मुझे मार्गदर्शन या बातचीत का संदर्भ मिला'), reply: l('Keep this reference. Follow only the correction confirmed for your request, then verify the result.', 'यह संदर्भ रखें। अपने अनुरोध के लिए बताया सुधार ही करें, फिर नतीजा जाँचें।'), outcome: { state: 'done', opens: 'aadhaar-confirm', reply: l('Guidance recorded; the update is not yet confirmed.', 'मार्गदर्शन दर्ज है; अपडेट की पुष्टि अभी नहीं हुई।') } },
        { id: 'no-help', label: l('I could not get a clear answer', 'मुझे स्पष्ट जवाब नहीं मिला'), reply: l('Your place is unchanged. Use UIDAI contact/support to ask for clarification, quoting the same request or interaction reference. Do not guess the rejection reason.', 'आपका कदम वही है। UIDAI संपर्क/सहायता पर उसी अनुरोध या बातचीत के संदर्भ से स्पष्टीकरण माँगें। अस्वीकृति का कारण स्वयं न मानें।') },
      ] },
    },
    {
      id: 'aadhaar-confirm', type: 'document-correction',
      title: l('Check the updated details yourself', 'अपडेट हुई जानकारी स्वयं जाँचें'),
      detail: l('After following UIDAI’s guidance, check the result through myAadhaar. A request receipt or help interaction alone does not mean the update succeeded.', 'UIDAI के मार्गदर्शन के बाद myAadhaar से नतीजा जाँचें। अनुरोध की पावती या हेल्पलाइन पर बात होना अपडेट की सफलता नहीं है।'),
      ask: l('Does the completed update show the correct details?', 'क्या पूरा हुआ अपडेट सही जानकारी दिखा रहा है?'),
      link: { url: 'https://myaadhaar.uidai.gov.in/', action: l('Check on myAadhaar', 'myAadhaar पर जाँचें'), collect: l('Keep the result date; do not upload your Aadhaar here.', 'नतीजे की तारीख रखें; आधार यहाँ अपलोड न करें।') },
      confirmLabel: l('Yes, I checked and the details are correct', 'हाँ, मैंने जाँचा और जानकारी सही है'),
      declineLabel: l('No, it is still pending or incorrect', 'नहीं, अभी लंबित या गलत है'),
      onConfirm: { state: 'done', resolves: 'aadhaar-status', opens: 'case-done', reply: l('Your confirmation is recorded. You can retain this case as your own record.', 'आपकी पुष्टि दर्ज है। यह केस अपने रिकॉर्ड के लिए रख सकते हैं।') },
      onDecline: { state: 'pending', opens: 'aadhaar-help', reply: l('Return to UIDAI with the same reference and the exact remaining issue.', 'उसी संदर्भ और बची हुई सही समस्या के साथ UIDAI से फिर पूछें।') },
    },
  ],
};

export const epfoClaim: WorkflowDefinition = {
  id: 'epfo-claim', authoredBy: 'bundled', firstNodeId: 'epfo-status',
  title: l('EPFO claim stuck', 'EPFO दावा अटका है'),
  subtitle: l('Trace your own pending or rejected PF withdrawal claim', 'अपने लंबित या अस्वीकृत PF निकासी दावे की स्थिति समझें'),
  nodes: [
    {
      id: 'epfo-status', type: 'online-action',
      title: l('Read the claim status and its reason', 'दावे की स्थिति और कारण पढ़ें'),
      detail: l('This journey is for your own PF withdrawal claim, not a death claim, pension calculation or eligibility advice. Open EPFO’s employee services and use Know Your Claim Status or the member service linked there. Keep the claim reference and exact status; “settled” alone is not proof that money reached your bank.', 'यह यात्रा आपके अपने PF निकासी दावे के लिए है; मृत्यु दावा, पेंशन गणना या पात्रता की सलाह के लिए नहीं। EPFO कर्मचारी सेवाओं में Know Your Claim Status या वहाँ दी सदस्य सेवा खोलें। दावा संदर्भ और सही स्थिति रखें; केवल “settled” दिखना बैंक में पैसा आने का प्रमाण नहीं है।'),
      ask: l('Check the status first. If the portal fails, record the error you saw; do not guess a rejection reason.', 'पहले स्थिति जाँचें। पोर्टल न चले तो दिखी त्रुटि दर्ज करें; अस्वीकृति का कारण स्वयं न मानें।'),
      link: { url: 'https://www.epfindia.gov.in/site_en/For_Employees.php', action: l('Open EPFO employee services', 'EPFO कर्मचारी सेवाएँ खोलें'), collect: l('Keep the claim ID, submission date, status and reason. UAN, passwords, OTPs and full account numbers belong only on the official service.', 'दावा आईडी, जमा तारीख, स्थिति और कारण रखें। UAN, पासवर्ड, OTP और पूरा खाता नंबर केवल सरकारी सेवा पर दें।') },
      onConfirm: recordOnly,
      report: { prompt: l('Record your actual claim status', 'अपने दावे की वास्तविक स्थिति दर्ज करें'), options: [
        { id: 'pending', label: l('Pending, no credit, or the portal will not show my result', 'लंबित है, पैसा नहीं आया या पोर्टल नतीजा नहीं दिखाता'), reply: l('We have not assumed a cause. Prepare a request asking EPFO for the status and next action.', 'हमने कारण नहीं माना है। EPFO से स्थिति और अगला कदम पूछने की तैयारी करें।'), outcome: { state: 'blocked', opens: 'epfo-grievance', note: l('Claim payment not confirmed', 'दावे के भुगतान की पुष्टि नहीं हुई'), reply: l('Prepare the claim facts for EPFO.', 'EPFO के लिए दावे की जानकारी तैयार करें।') } },
        { id: 'rejected', label: l('Rejected or returned for correction', 'अस्वीकृत या सुधार के लिए वापस हुआ'), reply: l('Keep the exact reason. Ask for clarification before resubmitting if you do not understand it.', 'सही कारण रखें। समझ न आए तो दोबारा जमा करने से पहले स्पष्टीकरण माँगें।'), outcome: { state: 'blocked', opens: 'epfo-grievance', note: l('Citizen reported a rejected or returned claim', 'नागरिक ने अस्वीकृत या वापस हुआ दावा दर्ज किया'), reply: l('Prepare the rejection message for clarification.', 'स्पष्टीकरण के लिए अस्वीकृति का संदेश तैयार रखें।') } },
        { id: 'credited', label: l('My bank shows the claim payment', 'मेरे बैंक में दावे का पैसा दिखता है'), reply: l('Confirm the actual bank credit next.', 'अब वास्तविक बैंक जमा की पुष्टि करें।'), outcome: { state: 'done', opens: 'epfo-confirm', reply: l('Verify the payment.', 'भुगतान जाँचें।') } },
      ] },
    },
    {
      id: 'epfo-grievance', type: 'grievance-file',
      title: l('Prepare a clear request for EPFO', 'EPFO के लिए स्पष्ट अनुरोध तैयार करें'),
      detail: l('EPFiGMS is EPFO’s grievance service. Use it to explain the unresolved claim or request clarification of its rejection. Enter identifying details and any attachments only on that official service. Sahayak does not submit the grievance or decide whether the claim is payable.', 'EPFiGMS, EPFO की शिकायत सेवा है। अनसुलझे दावे या अस्वीकृति का स्पष्टीकरण माँगने के लिए इसका उपयोग करें। पहचान की जानकारी और संलग्नक केवल उस सरकारी सेवा पर दें। सहायक शिकायत जमा नहीं करता और दावा देय है या नहीं, यह तय नहीं करता।'),
      ask: l('Use the preparation below, then return with the registration number after submitting yourself.', 'नीचे की तैयारी लेकर स्वयं जमा करें, फिर पंजीकरण नंबर के साथ यहाँ लौटें।'),
      link: { url: 'https://epfigms.gov.in/', action: l('Open EPFiGMS grievance service', 'EPFiGMS शिकायत सेवा खोलें'), collect: l('Keep the grievance registration number and submission date. A prepared request is not a registered grievance.', 'शिकायत पंजीकरण नंबर और जमा तारीख रखें। तैयार अनुरोध, पंजीकृत शिकायत नहीं है।') },
      visit: {
        office: l('EPFO through EPFiGMS', 'EPFiGMS के माध्यम से EPFO'),
        why: l('Ask for the actual status or the specific correction required.', 'वास्तविक स्थिति या आवश्यक विशेष सुधार पूछें।'),
        carry: [l('Claim acknowledgement and submission date', 'दावे की पावती और जमा तारीख'), l('Exact status or rejection wording; relevant evidence kept privately', 'स्थिति या अस्वीकृति के सही शब्द; संबंधित प्रमाण अपने पास सुरक्षित रखें')],
        script: l('My PF withdrawal claim has not been resolved. Its current status is [copy exact words]. Please explain what is pending, any correction required and the next action. Please provide a reference for follow-up.', 'मेरा PF निकासी दावा हल नहीं हुआ। अभी स्थिति है [सही शब्द लिखें]। कृपया बताएँ क्या लंबित है, कौन सा सुधार चाहिए और अगला कदम क्या है। आगे पूछने के लिए संदर्भ दें।'),
        expect: l('A registration or clarification, not guaranteed payment. Follow the service’s current instructions.', 'पंजीकरण या स्पष्टीकरण; भुगतान की गारंटी नहीं। सेवा के वर्तमान निर्देश मानें।'),
        collect: l('Grievance number, date, and the exact reply when one arrives', 'शिकायत नंबर, तारीख और जवाब आने पर उसके सही शब्द'),
      },
      onConfirm: recordOnly,
      report: { prompt: l('Record whether you registered the grievance', 'दर्ज करें कि शिकायत पंजीकृत हुई या नहीं'), options: [
        { id: 'submitted', label: l('I registered it and received a reference', 'मैंने पंजीकृत किया और संदर्भ मिला'), reply: l('Registration recorded as reported by you. The claim remains unresolved.', 'आपके बताए अनुसार पंजीकरण दर्ज है। दावा अभी अनसुलझा है।'), outcome: { state: 'done', opens: 'epfo-follow-up', reply: l('Keep the registration number for follow-up.', 'आगे पूछने के लिए पंजीकरण नंबर रखें।') } },
        { id: 'could-not-submit', label: l('I could not register it', 'मैं पंजीकृत नहीं कर पाया'), reply: l('No submission is claimed. Keep the error and try the official service again later; your preparation remains here.', 'कोई जमा होना नहीं माना गया। त्रुटि रखें और बाद में सरकारी सेवा पर फिर कोशिश करें; आपकी तैयारी यहीं है।') },
      ] },
    },
    {
      id: 'epfo-follow-up', type: 'online-action',
      title: l('Follow up using the same grievance number', 'उसी शिकायत नंबर से आगे पूछें'),
      detail: l('Use View Status on EPFiGMS. For a pending grievance, its Send Reminder facility lets you follow up using the existing registration. If the reply requests a correction, follow the instruction that applies to your claim; do not assume it is a bank or employer issue.', 'EPFiGMS में View Status देखें। लंबित शिकायत के लिए Send Reminder से उसी पंजीकरण पर आगे पूछ सकते हैं। जवाब में सुधार माँगा हो तो अपने दावे पर लागू निर्देश मानें; इसे स्वयं बैंक या नियोक्ता की समस्या न मानें।'),
      ask: l('What has actually changed since your grievance?', 'शिकायत के बाद वास्तव में क्या बदला?'),
      link: { url: 'https://epfigms.gov.in/', action: l('View status or send a reminder on EPFiGMS', 'EPFiGMS पर स्थिति देखें या रिमाइंडर भेजें'), collect: l('Keep the reply, its date and your existing reference.', 'जवाब, उसकी तारीख और पुराना संदर्भ रखें।') },
      onConfirm: recordOnly,
      report: { prompt: l('Record the follow-up result', 'आगे पूछने का नतीजा दर्ज करें'), options: [
        { id: 'waiting', label: l('Still waiting, or a reply did not resolve it', 'अभी इंतज़ार है या जवाब से समस्या हल नहीं हुई'), reply: l('The case stays open. Keep the same reference when asking for clarification or sending a reminder; a closed grievance is not proof of bank credit.', 'केस खुला रहेगा। स्पष्टीकरण या रिमाइंडर के लिए वही संदर्भ रखें; शिकायत बंद होना बैंक जमा का प्रमाण नहीं है।') },
        { id: 'credited', label: l('The claim payment now appears in my bank', 'दावे का पैसा अब मेरे बैंक में दिखता है'), reply: l('Confirm the credit you checked yourself.', 'स्वयं जाँचे बैंक जमा की पुष्टि करें।'), outcome: { state: 'done', opens: 'epfo-confirm', reply: l('Confirm the actual result.', 'वास्तविक नतीजे की पुष्टि करें।') } },
      ] },
    },
    {
      id: 'epfo-confirm', type: 'benefit-credit',
      title: l('Confirm the actual bank credit', 'वास्तविक बैंक जमा की पुष्टि करें'),
      detail: l('Check your own bank record. Portal settlement or grievance closure alone does not confirm payment.', 'अपना बैंक रिकॉर्ड जाँचें। पोर्टल पर निपटारा या शिकायत बंद होना अकेले भुगतान की पुष्टि नहीं है।'),
      ask: l('Have you checked that this claim’s money reached your account?', 'क्या आपने जाँचा कि इसी दावे का पैसा आपके खाते में आया?'),
      confirmLabel: l('Yes, the bank shows this payment', 'हाँ, बैंक में यह भुगतान दिखता है'), declineLabel: l('No, it has not arrived', 'नहीं, पैसा नहीं आया'),
      onConfirm: { state: 'done', resolves: 'epfo-status', opens: 'case-done', reply: l('Your payment confirmation is recorded.', 'भुगतान की आपकी पुष्टि दर्ज है।') },
      onDecline: { state: 'pending', opens: 'epfo-grievance', reply: l('The claim stays open. Keep your payment-status evidence for EPFO.', 'दावा खुला रहेगा। EPFO के लिए भुगतान स्थिति का प्रमाण रखें।') },
    },
  ],
};
