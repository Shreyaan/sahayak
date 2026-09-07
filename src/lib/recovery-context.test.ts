import { expect, test } from "bun:test";
import { recoveryContext } from "./recovery-context";
import { recordDeskReport, startCase, workflows } from "./workflow";

test("recovery is explained from a saved configured response, including after reload", () => {
 const snapshot = recordDeskReport(startCase("scholarship"), { optionId: "npci-missing", response: "Demo mapping issue", responseDate: "2026-09-07", recordedAt: "2026-09-07T09:00:00Z" }).caseSnapshot;
 const context = recoveryContext(JSON.parse(JSON.stringify(snapshot)), workflows.scholarship);
 expect(context?.report.response).toBe("Demo mapping issue");
 expect(context?.option.label.en).toContain("NPCI");
 expect(recoveryContext(startCase("scholarship"), workflows.scholarship)).toBeUndefined();
 const different = recordDeskReport(startCase("scholarship"), { optionId: "different", response: "Demo unknown", responseDate: "2026-09-07", recordedAt: "2026-09-07T09:00:00Z" }).caseSnapshot;
 expect(recoveryContext(different, workflows.scholarship)).toBeUndefined();
});
