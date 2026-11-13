// NEWS (National Early Warning Score) calculation
export function calculateNEWS(vitals: {
  respiratoryRate?: number | null;
  oxygenSaturation?: number | null;
  temperature?: number | null;
  systolicBP?: number | null;
  heartRate?: number | null;
  gcsScore?: number | null;
}): number {
  let score = 0;
  
  // Respiratory Rate
  if (vitals.respiratoryRate != null) {
    const rr = vitals.respiratoryRate;
    if (rr <= 8) score += 3;
    else if (rr <= 11) score += 1;
    else if (rr <= 20) score += 0;
    else if (rr <= 24) score += 2;
    else score += 3;
  }
  
  // Oxygen Saturation
  if (vitals.oxygenSaturation != null) {
    const spo2 = vitals.oxygenSaturation;
    if (spo2 <= 91) score += 3;
    else if (spo2 <= 93) score += 2;
    else if (spo2 <= 95) score += 1;
    else score += 0;
  }
  
  // Temperature
  if (vitals.temperature != null) {
    const temp = vitals.temperature;
    if (temp <= 35.0) score += 3;
    else if (temp <= 36.0) score += 1;
    else if (temp <= 38.0) score += 0;
    else if (temp <= 39.0) score += 1;
    else score += 2;
  }
  
  // Systolic BP
  if (vitals.systolicBP != null) {
    const sbp = vitals.systolicBP;
    if (sbp <= 90) score += 3;
    else if (sbp <= 100) score += 2;
    else if (sbp <= 110) score += 1;
    else if (sbp <= 219) score += 0;
    else score += 3;
  }
  
  // Heart Rate
  if (vitals.heartRate != null) {
    const hr = vitals.heartRate;
    if (hr <= 40) score += 3;
    else if (hr <= 50) score += 1;
    else if (hr <= 90) score += 0;
    else if (hr <= 110) score += 1;
    else if (hr <= 130) score += 2;
    else score += 3;
  }
  
  // Consciousness (simplified - using GCS < 15 as indicator)
  if (vitals.gcsScore != null && vitals.gcsScore < 15) {
    score += 3;
  }
  
  return score;
}

// GCS (Glasgow Coma Scale) calculation
export function calculateGCS(eye?: number, verbal?: number, motor?: number): number {
  const e = eye || 4;      // Default to normal (4)
  const v = verbal || 5;   // Default to normal (5)
  const m = motor || 6;    // Default to normal (6)
  
  return e + v + m;
}

// qSOFA (Quick Sequential Organ Failure Assessment)
export function calculateQSOFA(
  respiratoryRate?: number | null,
  systolicBP?: number | null,
  gcsScore?: number | null
): number {
  let score = 0;
  
  if (respiratoryRate != null && respiratoryRate >= 22) score += 1;
  if (systolicBP != null && systolicBP <= 100) score += 1;
  if (gcsScore != null && gcsScore < 15) score += 1;
  
  return score;
}
