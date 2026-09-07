import type { WorkflowNode } from "./workflow";

/** Operational correction verified on PFMS's public homepage, 8 September 2026.
 * Published versions stay immutable; this correction only
 * replaces an unavailable external entry point and its form instructions.
 */
export function correctServiceLink(node: WorkflowNode): WorkflowNode {
  if (node.link?.url !== "https://pfms.nic.in/SitePages/DBT_StatusTracker.aspx") return node;
  return {
    ...node,
    detail: {
      en: "Check your payment status on PFMS. Enter your bank details and complete verification only on the official website. Keep the payment message, date and any reference number, then return here to record the response. If the page won’t open, go to https://pfms.nic.in/ and choose Payment Status → Know Your Payment. If you still can’t check, open ‘Can’t check online? Get help in person’ for what to take and ask. You can return later; your place is saved.",
      hi: "PFMS पर अपने भुगतान की स्थिति देखें। बैंक विवरण भरें और सत्यापन केवल आधिकारिक वेबसाइट पर पूरा करें। भुगतान का संदेश, तारीख और कोई संदर्भ नंबर मिले तो रख लें, फिर यहाँ लौटकर जवाब दर्ज करें। पेज न खुले तो https://pfms.nic.in/ पर Payment Status → Know Your Payment चुनें। फिर भी जाँच न हो पाए तो ‘ऑनलाइन नहीं हो रहा? यहाँ मदद लें’ खोलें—इसमें क्या साथ ले जाएँ और क्या पूछें बताया गया है। आप बाद में लौट सकते हैं; आपका स्थान सुरक्षित है।",
    },
    link: {
      ...node.link,
      url: "https://pfms.nic.in/SitePages/KnowYourPayment_Dw_NewNew.aspx",
      action: {en: "Open PFMS Know Your Payment", hi: "PFMS Know Your Payment खोलें"},
    },
  };
}
