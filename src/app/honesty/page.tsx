import { sharedStepTypes, workflowIds, workflows, type StepType } from "@/lib/workflow";
import styles from "./honesty.module.css";

export const metadata = {
  title: "क्या असली, क्या नमूना · Honesty — Sahayak",
};

const stepTypeLabels: Record<StepType, { hindi: string; english: string }> = {
  "document-explain": { hindi: "काग़ज़ समझाना", english: "Explain a document" },
  "identity-compare": { hindi: "नाम/पहचान मिलान", english: "Compare identity details" },
  "document-correction": { hindi: "सुधार पत्र बनाना", english: "Draft a correction" },
  "office-visit": { hindi: "दफ़्तर का चक्कर", english: "Office visit" },
  "desk-verification": { hindi: "डेस्क पर जाँच", english: "Desk verification with an SLA clock" },
  "bank-seeding-fix": { hindi: "बैंक सीडिंग सुधार", english: "Bank / NPCI seeding fix" },
  "grievance-file": { hindi: "शिकायत दर्ज", english: "File a grievance" },
  "rti-escalate": { hindi: "RTI escalation", english: "Draft an RTI escalation" },
  "benefit-credit": { hindi: "राशि जमा", english: "Benefit credit" },
  "case-complete": { hindi: "केस पूरा", english: "Case complete" },
};

const real = [
  { hindi: "बातचीत", english: "The Hindi-first conversation with the clerk." },
  {
    hindi: "वर्कफ़्लो इंजन",
    english: "The deterministic workflow engine. It decides every state change, not the model.",
  },
  { hindi: "आवाज़ से लिखना", english: "Speech-to-text on your push-to-talk recording." },
  { hindi: "जवाब बोलना", english: "Text-to-speech for the clerk's reply." },
  { hindi: "काग़ज़ बनाना", english: "Artifact generation from structured case data." },
  {
    hindi: "योगदान कंपाइलर",
    english: "The contributor draft compiler: it turns a lived experience into a structured draft.",
  },
];

const simulated = [
  { hindi: "हर सरकारी डेस्क", english: "Every government desk and counter." },
  { hindi: "बैंक और EPFO", english: "The bank and EPFO claim desks." },
  { hindi: "PFMS / NPCI जमा", english: "PFMS and NPCI payment credit and bounce reasons." },
  { hindi: "जमा करना", english: "Every submission. Nothing is ever sent anywhere." },
  { hindi: "अस्वीकृति", english: "The rejection you see in the timeline." },
  { hindi: "समय-सीमा पार होना", english: "The SLA breach and the clock behind it." },
  { hindi: "सारा डेटा", english: "All names, numbers, offices, and references are synthetic." },
];

const never = [
  {
    hindi: "कोई सरकारी सिस्टम से जुड़ाव नहीं है।",
    english: "No live government integration of any kind.",
  },
  {
    hindi: "कोई असली लॉगिन, पासवर्ड या क्रेडेंशियल नहीं।",
    english: "No real credentials.",
  },
  { hindi: "कोई भुगतान नहीं, कोई OTP नहीं।", english: "No payments and no OTPs." },
  {
    hindi: "कोई आधार, PAN या निजी जानकारी नहीं ली जाती।",
    english: "No Aadhaar, PAN, or personal data is collected.",
  },
  {
    hindi: "escalation सिर्फ़ मसौदा बनकर क़तार में रहती है; प्रोटोटाइप से बाहर कुछ भी भेजने से पहले आपकी मंज़ूरी ली जाती है।",
    english:
      "Escalations are drafted and queued only. The citizen approves anything that would go outside the prototype.",
  },
  {
    hindi: "RTI का 48-घंटे वाला जीवन-स्वतंत्रता प्रावधान सामान्य देरी पर लागू नहीं किया जाता।",
    english: "The RTI 48-hour life-or-liberty period is not applied to ordinary delay.",
  },
];

export default function HonestyPage() {
  const shared = sharedStepTypes();

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Sahayak · Honesty</p>
      <h1 className={styles.title}>क्या असली है, क्या नमूना है</h1>
      <p className={styles.lede}>
        What this prototype really does, and what it only pretends to do. Nothing here is hidden in
        small print.
      </p>

      <section className={`${styles.panel} ${styles.realPanel}`}>
        <h2>
          असली · Real
          <span>यह प्रोटोटाइप सचमुच यह करता है</span>
        </h2>
        <ul className={styles.list}>
          {real.map((item) => (
            <li key={item.english}>
              <strong>{item.hindi}</strong>
              <span>{item.english}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${styles.panel} ${styles.simulatedPanel}`}>
        <h2>
          नमूना · Simulated
          <span>यह सब सिर्फ़ दिखावे के लिए है</span>
        </h2>
        <ul className={styles.list}>
          {simulated.map((item) => (
            <li key={item.english}>
              <strong>{item.hindi}</strong>
              <span>{item.english}</span>
            </li>
          ))}
        </ul>
        <p className={styles.warning}>
          कुछ भी, कहीं भी जमा नहीं किया जाता। · Nothing is ever submitted anywhere.
        </p>
      </section>

      <section className={styles.panel}>
        <h2>
          सीमाएँ · Hard limits
          <span>यह प्रोटोटाइप यह कभी नहीं करता</span>
        </h2>
        <ul className={styles.list}>
          {never.map((item) => (
            <li key={item.english}>
              <strong>{item.hindi}</strong>
              <span>{item.english}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.panel}>
        <h2>
          एक ही इंजन · Composition proof
          <span>
            दोनों यात्राएँ इन्हीं साझा कदमों से बनी हैं · Both journeys are built from these shared
            step types
          </span>
        </h2>
        <p className={styles.journeys}>
          {workflowIds.map((id) => `${workflows[id].title} (${workflows[id].subtitle})`).join(" · ")}
        </p>
        <ul className={styles.list}>
          {shared.map((type) => (
            <li key={type}>
              <strong>{stepTypeLabels[type].hindi}</strong>
              <span>{stepTypeLabels[type].english}</span>
              <code className={styles.code}>{type}</code>
            </li>
          ))}
        </ul>
        <p className={styles.note}>
          वर्कफ़्लो सिर्फ़ कदम का प्रकार और अपनी सामग्री देता है; कदम का व्यवहार एक ही इंजन तय करता है.
          <span>
            A workflow only names a step type and supplies its own content. One engine runs both.
          </span>
        </p>
      </section>

      <nav className={styles.links}>
        <a href="/">← होम पर लौटें · Back to home</a>
        <a href="/case-card?workflow=bereavement">नमूना Case Card · Sample Case Card</a>
      </nav>

      <footer className={styles.footer}>
        <p>SYNTHETIC DEMO — all values are synthetic</p>
        <p>Independent hackathon prototype. Not affiliated with any government body.</p>
      </footer>
    </main>
  );
}
