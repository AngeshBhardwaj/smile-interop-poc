import { SensitiveFieldType } from '@smile/common';

/**
 * Patient registration data with PII/PHI fields marked
 */
export interface PatientRegistrationData {
  // Primary identifiers (PHI)
  patientId: string; // Medical Record Number
  externalPatientId?: string; // External system ID

  // Personal information (PII/PHI)
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO 8601 format
  gender: 'male' | 'female' | 'other' | 'unknown';

  // Contact information (PII)
  phoneNumber?: string;
  email?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };

  // Emergency contact (PII)
  emergencyContact?: {
    name: string;
    relationship: string;
    phoneNumber: string;
  };

  // Insurance information (PHI)
  insurance?: {
    provider: string;
    policyNumber: string;
    groupNumber?: string;
    memberId: string;
  };

  // System metadata (non-sensitive)
  registrationDate: string;
  facilityId: string;
  registeredBy: string;
  status: 'active' | 'inactive' | 'deceased' | 'merged';
}

/**
 * Appointment scheduling data
 */
export interface AppointmentData {
  // Identifiers
  appointmentId: string;
  patientId: string; // Reference to patient (PHI)
  providerId: string;

  // Appointment details
  appointmentDateTime: string; // ISO 8601 format
  appointmentType: 'consultation' | 'followup' | 'emergency' | 'procedure' | 'telemedicine';
  duration: number; // in minutes
  status: 'scheduled' | 'confirmed' | 'checked-in' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';

  // Clinical information (PHI)
  reasonForVisit?: string;
  notes?: string;
  specialInstructions?: string;

  // Location information
  location: {
    facilityId: string;
    facilityName: string;
    department?: string;
    room?: string;
    address?: string;
  };

  // System metadata
  scheduledDate: string;
  scheduledBy: string;
  lastModified: string;
  lastModifiedBy: string;
}

/**
 * Vital signs measurement data
 */
export interface VitalSignsData {
  // Identifiers
  recordId: string;
  patientId: string; // PHI
  encounterId?: string;

  // Measurement details
  recordedDateTime: string; // ISO 8601 format
  recordedBy: string; // Healthcare provider ID

  // Vital signs measurements (PHI)
  vitalSigns: {
    bloodPressure?: {
      systolic: number;
      diastolic: number;
      unit: 'mmHg';
      position?: 'sitting' | 'standing' | 'lying';
    };
    heartRate?: {
      value: number;
      unit: 'bpm';
      rhythm?: 'regular' | 'irregular';
    };
    temperature?: {
      value: number;
      unit: 'celsius' | 'fahrenheit';
      site?: 'oral' | 'rectal' | 'axillary' | 'temporal' | 'tympanic';
    };
    respiratoryRate?: {
      value: number;
      unit: 'breaths/min';
    };
    oxygenSaturation?: {
      value: number;
      unit: 'percentage';
      onRoomAir: boolean;
    };
    weight?: {
      value: number;
      unit: 'kg' | 'lbs';
    };
    height?: {
      value: number;
      unit: 'cm' | 'inches';
    };
    bmi?: {
      value: number;
      category: 'underweight' | 'normal' | 'overweight' | 'obese';
    };
  };

  // Clinical context
  clinicalContext?: {
    consciousness: 'alert' | 'drowsy' | 'unconscious';
    mobility: 'ambulatory' | 'wheelchair' | 'bedbound';
    pain?: {
      scale: number; // 0-10
      location?: string;
    };
  };

  // System metadata
  facilityId: string;
  deviceInfo?: {
    deviceId: string;
    deviceType: string;
    manufacturer?: string;
  };
}

/**
 * Clinical notification data
 */
export interface ClinicalNotificationData {
  // Identifiers
  notificationId: string;
  patientId?: string; // PHI - optional for system notifications
  recipientId: string;
  recipientType: 'patient' | 'provider' | 'administrator' | 'family';

  // Notification details
  type: 'appointment-reminder' | 'lab-results' | 'medication-reminder' | 'critical-alert' | 'discharge-instructions' | 'care-plan-update';
  priority: 'low' | 'medium' | 'high' | 'urgent' | 'critical';
  category: 'clinical' | 'administrative' | 'emergency' | 'preventive';

  // Message content (may contain PHI)
  title: string;
  message: string;
  attachments?: {
    type: 'document' | 'image' | 'video';
    url: string;
    description: string;
  }[];

  // Delivery settings
  scheduledFor?: string; // ISO 8601 format
  expiresAt?: string; // ISO 8601 format
  channels: ('email' | 'sms' | 'push' | 'portal' | 'phone')[];
  deliveryAttempts: number;
  deliveryStatus: 'pending' | 'sent' | 'delivered' | 'failed' | 'expired';

  // Clinical context
  clinicalContext?: {
    encounterId?: string;
    orderId?: string;
    diagnosis?: string;
    urgency: 'routine' | 'urgent' | 'stat';
  };

  // System metadata
  createdDate: string;
  createdBy: string;
  facilityId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Laboratory result data
 */
export interface LabResultData {
  // Identifiers
  resultId: string;
  patientId: string; // PHI
  orderId: string;
  specimenId?: string;

  // Provider information
  orderingProviderId: string;
  performingLabId: string;
  labName: string;

  // Timing
  orderDateTime: string;
  collectionDateTime: string;
  receivedDateTime?: string;
  resultDateTime: string;
  reportedDateTime?: string;

  // Specimen information (PHI)
  specimen?: {
    type: string; // blood, urine, tissue, etc.
    source: string; // venipuncture, catheter, etc.
    quality: 'adequate' | 'inadequate' | 'hemolyzed' | 'clotted';
  };

  // Test results (PHI)
  tests: {
    testId: string;
    testName: string;
    testCode: string; // LOINC code
    result: string;
    unit?: string;
    referenceRange?: string;
    status: 'normal' | 'abnormal' | 'critical' | 'pending' | 'cancelled';
    flags?: ('high' | 'low' | 'critical' | 'abnormal')[];
    notes?: string;
    methodology?: string;
  }[];

  // Overall assessment
  overallStatus: 'preliminary' | 'final' | 'corrected' | 'amended' | 'cancelled';
  clinicalSignificance?: 'normal' | 'abnormal' | 'critical';
  interpretation?: string;

  // Quality and validation
  performedBy?: string;
  verifiedBy?: string;
  authorizedBy?: string;

  // System metadata
  facilityId: string;
  reportFormat?: 'structured' | 'narrative' | 'image';
}

/**
 * Medication management data
 */
export interface MedicationData {
  // Identifiers
  medicationId: string;
  patientId: string; // PHI
  prescriptionId?: string;
  orderSetId?: string;

  // Prescriber information
  prescriberId: string;
  prescriptionDate: string;

  // Medication details (PHI)
  medication: {
    name: string;
    genericName?: string;
    brandName?: string;
    ndc?: string; // National Drug Code
    rxcui?: string; // RxNorm Concept Unique Identifier
    strength: string;
    form: 'tablet' | 'capsule' | 'liquid' | 'injection' | 'cream' | 'inhaler' | 'patch' | 'other';
  };

  // Dosing instructions (PHI)
  dosing: {
    dosage: string;
    frequency: string;
    route: 'oral' | 'injection' | 'topical' | 'inhalation' | 'rectal' | 'sublingual' | 'other';
    duration?: string;
    instructions: string;
    specialInstructions?: string;
  };

  // Prescription details
  quantity: number;
  refillsRemaining: number;
  totalRefills: number;
  daysSupply: number;

  // Clinical information (PHI)
  indication?: string;
  allergies?: string[];
  contraindications?: string[];
  interactions?: string[];

  // Status and lifecycle
  status: 'active' | 'completed' | 'discontinued' | 'on-hold' | 'cancelled' | 'suspended';
  startDate: string;
  endDate?: string;
  discontinuedDate?: string;
  discontinuedReason?: string;

  // Dispensing information
  pharmacy?: {
    pharmacyId: string;
    pharmacyName: string;
    address?: string;
    phone?: string;
  };
  lastDispensedDate?: string;
  nextDueDate?: string;

  // System metadata
  facilityId: string;
  enteredBy: string;
  lastModified: string;
  lastModifiedBy: string;
}

/**
 * Health Event Types enumeration
 */
export enum HealthEventType {
  // Patient lifecycle events
  PATIENT_REGISTERED = 'health.patient.registered',
  PATIENT_UPDATED = 'health.patient.updated',
  PATIENT_MERGED = 'health.patient.merged',
  PATIENT_DECEASED = 'health.patient.deceased',

  // Appointment events
  APPOINTMENT_SCHEDULED = 'health.appointment.scheduled',
  APPOINTMENT_UPDATED = 'health.appointment.updated',
  APPOINTMENT_CONFIRMED = 'health.appointment.confirmed',
  APPOINTMENT_CANCELLED = 'health.appointment.cancelled',
  APPOINTMENT_COMPLETED = 'health.appointment.completed',
  APPOINTMENT_NO_SHOW = 'health.appointment.no-show',

  // Clinical measurement events
  VITAL_SIGNS_RECORDED = 'health.vitals.recorded',
  VITAL_SIGNS_UPDATED = 'health.vitals.updated',

  // Communication events
  NOTIFICATION_SENT = 'health.notification.sent',
  NOTIFICATION_DELIVERED = 'health.notification.delivered',
  NOTIFICATION_FAILED = 'health.notification.failed',

  // Laboratory events
  LAB_ORDER_PLACED = 'health.lab.order-placed',
  LAB_SPECIMEN_COLLECTED = 'health.lab.specimen-collected',
  LAB_RESULT_AVAILABLE = 'health.lab.result-available',
  LAB_RESULT_CRITICAL = 'health.lab.result-critical',

  // Medication events
  MEDICATION_PRESCRIBED = 'health.medication.prescribed',
  MEDICATION_DISPENSED = 'health.medication.dispensed',
  MEDICATION_ADMINISTERED = 'health.medication.administered',
  MEDICATION_DISCONTINUED = 'health.medication.discontinued',
}

/**
 * Union type for all health event data
 */
export type HealthEventData =
  | PatientRegistrationData
  | AppointmentData
  | VitalSignsData
  | ClinicalNotificationData
  | LabResultData
  | MedicationData;

/**
 * Event metadata for health events
 */
export interface HealthEventMetadata {
  // Facility and department context
  facilityId: string;
  facilityName?: string;
  departmentId?: string;
  departmentName?: string;

  // User context
  userId: string;
  userRole?: string;
  sessionId?: string;

  // Request tracking
  correlationId?: string;
  requestId?: string;

  // Source system information
  source: string;
  sourceVersion: string;
  integrationId?: string;

  // Data classification for security
  dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
  containsPHI: boolean;
  containsPII: boolean;

  // Compliance and audit
  legalBasis?: string; // HIPAA treatment/payment/operations or GDPR basis
  retentionPeriod?: string;
  encryptionRequired: boolean;

  // Event context
  eventVersion: string;
  eventSource: string;
}

/**
 * Field mapping for PII/PHI identification in PatientRegistrationData
 */
export const PATIENT_REGISTRATION_FIELD_MAPPING: Record<keyof PatientRegistrationData, SensitiveFieldType | null> = {
  patientId: SensitiveFieldType.PATIENT_ID,
  externalPatientId: SensitiveFieldType.PATIENT_ID,
  firstName: SensitiveFieldType.FIRST_NAME,
  lastName: SensitiveFieldType.LAST_NAME,
  dateOfBirth: SensitiveFieldType.DATE_OF_BIRTH,
  gender: null, // Not considered PII in aggregated form
  phoneNumber: SensitiveFieldType.PHONE,
  email: SensitiveFieldType.EMAIL,
  address: SensitiveFieldType.ADDRESS,
  emergencyContact: null, // Complex object, handle separately
  insurance: SensitiveFieldType.INSURANCE_NUMBER,
  registrationDate: null,
  facilityId: null,
  registeredBy: null,
  status: null,
};

/**
 * Utility function to determine if event contains PHI/PII
 */
export function containsHealthPHI(eventType: HealthEventType): boolean {
  const phiEvents = [
    HealthEventType.PATIENT_REGISTERED,
    HealthEventType.PATIENT_UPDATED,
    HealthEventType.VITAL_SIGNS_RECORDED,
    HealthEventType.LAB_RESULT_AVAILABLE,
    HealthEventType.MEDICATION_PRESCRIBED,
  ];

  return phiEvents.includes(eventType);
}