type LegacyMockRecord = {
  id?: string | null;
  trackingNumber?: string | null;
};

const LEGACY_MOCK_ADMISSION_IDS = new Set([
  "BAC-APP-001",
  "BAC-APP-002",
  "BAC-APP-003",
  "TAY-APP-001",
  "GMA-APP-001",
]);

const LEGACY_MOCK_ADMISSION_TRACKING_NUMBERS = new Set([
  "AICS-20260401-BAC101",
  "AICS-20260402-BAC102",
  "AICS-20260403-BAC103",
  "AICS-20260401-TAY101",
  "AICS-20260401-GMA101",
]);

const LEGACY_MOCK_ENROLLMENT_REQUEST_IDS = new Set([
  "ER001",
  "ER002",
  "ER003",
]);

const LEGACY_MOCK_ENROLLMENT_REQUEST_TRACKING_NUMBERS = new Set([
  "TRK-ER001",
  "TRK-ER002",
  "TRK-ER003",
]);

export const isLegacyMockAdmissionRecord = (record: LegacyMockRecord) =>
  (record.id ? LEGACY_MOCK_ADMISSION_IDS.has(record.id) : false) ||
  (record.trackingNumber
    ? LEGACY_MOCK_ADMISSION_TRACKING_NUMBERS.has(record.trackingNumber)
    : false);

export const isLegacyMockEnrollmentRequestRecord = (
  record: LegacyMockRecord,
) =>
  (record.id ? LEGACY_MOCK_ENROLLMENT_REQUEST_IDS.has(record.id) : false) ||
  (record.trackingNumber
    ? LEGACY_MOCK_ENROLLMENT_REQUEST_TRACKING_NUMBERS.has(record.trackingNumber)
    : false);

export const isLegacyMockStudentRecord = (record: LegacyMockRecord) =>
  isLegacyMockAdmissionRecord(record) || isLegacyMockEnrollmentRequestRecord(record);

export const stripLegacyMockAdmissionRecords = <T extends LegacyMockRecord>(
  records: T[],
) => records.filter((record) => !isLegacyMockAdmissionRecord(record));

export const stripLegacyMockEnrollmentRequestRecords = <
  T extends LegacyMockRecord,
>(
  records: T[],
) => records.filter((record) => !isLegacyMockEnrollmentRequestRecord(record));

export const stripLegacyMockStudentRecords = <T extends LegacyMockRecord>(
  records: T[],
) => records.filter((record) => !isLegacyMockStudentRecord(record));
