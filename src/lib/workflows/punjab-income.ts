import type { WorkflowDefinition, DeskReportOption } from '../workflow';
import type { Localized } from '../locale';

const l = (en: string, hi: string): Localized => ({ en, hi });
const recordOnly = { state: 'needs-you' as const, reply: l('Record only a response you received yourself.', 'केवल स्वयं मिला जवाब दर्ज करें।') };
const issued: DeskReportOption = {
  id: 'issued', label: l('The certificate is shown as issued', 'प्रमाणपत्र जारी दिख रहा है'),
  reply: l('Now obtain the certificate and check its details.', 'अब प्रमाणपत्र प्राप्त करें और जानकारी जाँचें।'),
  outcome: { state: 'done', opens: 'punjab-confirm', reply: l('An issued status alone does not confirm you have the correct certificate.', 'केवल जारी स्थिति से सही प्रमाणपत्र मिलने की पुष्टि नहीं होती।') },
};

export const punjabIncome: WorkflowDefinition = {
  id: 'punjab-income', authoredBy: 'bundled', firstNodeId: 'punjab-status',
  title: l('Punjab income certificate stuck', 'पंजाब का आय प्रमाणपत्र अटका है'),
  subtitle: l('Follow up an existing Punjab application through Sewa Kendra or 1100', 'सेवा केंद्र या 1100 से पंजाब के मौजूदा आवेदन पर आगे पूछें'),
  nodes: [
    {
      id: 'punjab-status', type: 'online-action', title: l('Find your application and its exact status', 'अपना आवेदन और उसकी सही स्थिति खोजें'),
      detail: l('For an income-certificate application already made in Punjab. Keep your receipt or application SMS. Use Punjab’s official service links to track the application. If tracking fails, or you have lost the reference, ask your Sewa Kendra or call 1100 for help locating it. You do not need a desk response to prepare this first step.', 'पंजाब में पहले से किए आय प्रमाणपत्र आवेदन के लिए। पावती या आवेदन का SMS पास रखें। पंजाब की सरकारी सेवा से स्थिति देखें। ट्रैकिंग न चले या संदर्भ खो गया हो तो अपने सेवा केंद्र या 1100 से आवेदन खोजने में मदद लें। इस पहले कदम की तैयारी के लिए पहले से जवाब होना ज़रूरी नहीं है।'),
      ask: l('Check first; return here when you receive a status or an answer.', 'पहले जाँचें; स्थिति या जवाब मिलने पर यहाँ लौटें।'),
      link: { url: 'https://connect.punjab.gov.in/', action: l('Open Connect Punjab', 'Connect Punjab खोलें'), collect: l('Keep the exact status and date. Enter OTPs and identity details only on the official service.', 'सही स्थिति और तारीख रखें। OTP और पहचान की जानकारी केवल सरकारी सेवा पर दें।') },
      visit: {
        office: l('Your Punjab Sewa Kendra, or helpline 1100', 'आपका पंजाब सेवा केंद्र या हेल्पलाइन 1100'),
        why: l('Locate the existing application before making another trip or application.', 'दूसरा चक्कर या आवेदन करने से पहले मौजूदा आवेदन खोजें।'),
        carry: [l('Application receipt or SMS, if available', 'आवेदन की पावती या SMS, यदि उपलब्ध हो'), l('Application date and the service centre or portal used', 'आवेदन की तारीख और इस्तेमाल किया सेवा केंद्र या पोर्टल')],
        script: l('I applied for a Punjab income certificate. Please locate my application and tell me its exact status, what is pending, and whether I need to do anything. If I need another office, please name it and explain why.', 'मैंने पंजाब में आय प्रमाणपत्र के लिए आवेदन किया था। कृपया आवेदन खोजकर सही स्थिति, लंबित काम और मेरे अगले कदम के बारे में बताएँ। दूसरे कार्यालय जाना हो तो उसका नाम और कारण बताएँ।'),
        expect: l('A status or explanation, not a guaranteed certificate or completion date.', 'स्थिति या स्पष्टीकरण; प्रमाणपत्र या पूरा होने की तारीख की गारंटी नहीं।'),
        collect: l('Application reference, exact answer, date and any follow-up reference issued', 'आवेदन संदर्भ, सही जवाब, तारीख और जारी हुआ आगे पूछने का संदर्भ'),
      },
      onConfirm: recordOnly,
      report: { prompt: l('What did the service actually report?', 'सेवा ने वास्तव में क्या बताया?'), options: [
        { id: 'pending', label: l('Pending, or they could not locate the result', 'लंबित है या नतीजा नहीं मिला'), reply: l('Keep the same application details for support.', 'सहायता के लिए इसी आवेदन की जानकारी रखें।'), outcome: { state: 'blocked', opens: 'punjab-support', reply: l('Prepare to ask what is holding it up.', 'देरी का कारण पूछने की तैयारी करें।') } },
        { id: 'rejected', label: l('Rejected or returned for correction', 'अस्वीकृत या सुधार के लिए वापस'), reply: l('Keep the exact reason; do not guess which document is wrong.', 'सही कारण रखें; कौन सा दस्तावेज़ गलत है, अनुमान न लगाएँ।'), outcome: { state: 'blocked', opens: 'punjab-support', reply: l('Ask for the specific correction and where to make it.', 'ज़रूरी सुधार और उसे कहाँ करना है, पूछें।') } },
        issued,
      ] },
    },
    {
      id: 'punjab-support', type: 'office-visit', title: l('Ask Sewa Kendra or 1100 for a concrete next step', 'सेवा केंद्र या 1100 से स्पष्ट अगला कदम पूछें'),
      detail: l('Punjab lists 1100 for Sewa Kendra queries and complaints. Quote your existing application and its exact status. Ask what remains pending, which correction is required, and where it must be made. Ask for a follow-up reference if one is issued. Sahayak has not contacted anyone or registered a complaint.', 'पंजाब सेवा केंद्र के सवालों और शिकायतों के लिए 1100 बताता है। मौजूदा आवेदन और उसकी सही स्थिति बताएँ। पूछें क्या लंबित है, कौन सा सुधार चाहिए और कहाँ होगा। जारी हो तो आगे पूछने का संदर्भ लें। सहायक ने किसी से संपर्क या शिकायत दर्ज नहीं की है।'),
      ask: l('Keep your receipt and any rejection message ready. A support reference is not an approval.', 'पावती और अस्वीकृति का संदेश तैयार रखें। सहायता संदर्भ मंजूरी नहीं है।'),
      link: { url: 'https://dit.punjab.gov.in/projects/sewa-kendras/', action: l('Official Sewa Kendra support information', 'सरकारी सेवा केंद्र सहायता जानकारी'), collect: l('Save the answer, date, reference and the action you were asked to take.', 'जवाब, तारीख, संदर्भ और बताया गया अगला काम रखें।') },
      onConfirm: recordOnly,
      report: { prompt: l('Record the assistance you actually received', 'वास्तव में मिली सहायता दर्ज करें'), options: [
        { id: 'acknowledged', label: l('I received instructions or a support reference', 'मुझे निर्देश या सहायता संदर्भ मिला'), reply: l('Follow only the instruction confirmed for your application.', 'अपने आवेदन के लिए बताया गया निर्देश ही मानें।'), outcome: { state: 'done', opens: 'punjab-follow-up', reply: l('Support recorded. The certificate is still unconfirmed.', 'सहायता दर्ज है। प्रमाणपत्र की पुष्टि अभी नहीं हुई।') } },
        { id: 'no-answer', label: l('I could not get a clear answer', 'स्पष्ट जवाब नहीं मिला'), reply: l('Your case stays here. If the portal failed, try 1100 or your Sewa Kendra with the same receipt. Record any error; do not invent a response.', 'केस यहीं रहेगा। पोर्टल न चला हो तो उसी पावती के साथ 1100 या सेवा केंद्र से मदद लें। त्रुटि दर्ज करें; जवाब स्वयं न बनाएँ।') },
        issued,
      ] },
    },
    {
      id: 'punjab-follow-up', type: 'online-action', title: l('Follow up with your existing references', 'मौजूदा संदर्भों से आगे पूछें'),
      detail: l('After taking the action confirmed by the service, check the application again. If it is still pending or a complaint was closed without the certificate, quote both your application and support references to 1100 or Sewa Kendra. Ask what remains unresolved.', 'सेवा का बताया काम करने के बाद आवेदन फिर जाँचें। अभी लंबित हो या प्रमाणपत्र मिले बिना शिकायत बंद हुई हो तो 1100 या सेवा केंद्र पर आवेदन और सहायता दोनों संदर्भ देकर बची समस्या पूछें।'),
      ask: l('Has the certificate actually been issued?', 'क्या प्रमाणपत्र वास्तव में जारी हुआ है?'),
      onConfirm: recordOnly,
      report: { prompt: l('Record the follow-up result', 'आगे पूछने का नतीजा दर्ज करें'), options: [
        { id: 'waiting', label: l('Still waiting or the reply did not resolve it', 'अभी इंतज़ार है या जवाब से हल नहीं हुआ'), reply: l('The case stays open. Keep the reply and use your existing references when following up.', 'केस खुला रहेगा। जवाब रखें और आगे पूछते समय मौजूदा संदर्भ दें।') }, issued,
      ] },
    },
    {
      id: 'punjab-confirm', type: 'document-correction', title: l('Obtain and check the certificate', 'प्रमाणपत्र प्राप्त करें और जाँचें'),
      detail: l('Download through the official service or ask your Sewa Kendra for help obtaining the issued certificate. Check your name and the income details against your application. An issued status or closed complaint alone does not complete this task.', 'सरकारी सेवा से डाउनलोड करें या जारी प्रमाणपत्र प्राप्त करने में सेवा केंद्र से मदद लें। नाम और आय की जानकारी अपने आवेदन से मिलाएँ। केवल जारी स्थिति या बंद शिकायत से काम पूरा नहीं होता।'),
      ask: l('Do you have the certificate, and are its details correct?', 'क्या प्रमाणपत्र मिल गया और जानकारी सही है?'),
      confirmLabel: l('Yes, I have checked the certificate', 'हाँ, मैंने प्रमाणपत्र जाँच लिया'), declineLabel: l('No, I cannot obtain it or details are wrong', 'नहीं, मिल नहीं रहा या जानकारी गलत है'),
      onConfirm: { state: 'done', resolves: 'punjab-status', opens: 'case-done', reply: l('Your confirmation is recorded.', 'आपकी पुष्टि दर्ज है।') },
      onDecline: { state: 'pending', opens: 'punjab-support', reply: l('Keep the application reference and describe the download problem or incorrect field to support.', 'आवेदन संदर्भ रखें और सहायता से डाउनलोड की समस्या या गलत जानकारी बताएँ।') },
    },
  ],
};
