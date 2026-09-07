/** Fictional UI fixtures, never government-fetched data or identity verification. */
export const demoProfile = {
  name: { en: "Aman Kumar (Demo)", hi: "अमन कुमार (डेमो)" },
  documents: [
    { name: { en: "Aadhaar", hi: "आधार" }, number: "XXXX XXXX DEMO" },
    { name: { en: "PAN", hi: "पैन" }, number: "XXXXX DEMO X" },
  ],
} as const;
