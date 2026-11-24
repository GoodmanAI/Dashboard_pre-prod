import { expect, it } from "vitest";
import { resumeEquipements } from "./referentielClient";

it("résume les équipements, sigles intacts et accords justes (C-59)", () => {
  expect(resumeEquipements({ nombreIrm: 2, nombreScanners: 1, nombreRadio: 3 })).toBe("2 IRM · 1 scanner · 3 salles de radio");
  expect(resumeEquipements({ nombreEcho: 1, nombreMammo: 2 })).toBe("1 échographe · 2 mammographes");
  expect(resumeEquipements({ nombreIrm: 0, nombreScanners: null })).toBeNull();
});
