import { CloudEventV1 } from 'cloudevents';
import { EventEmitter } from '@smile/cloud-events';
import {
  logger,
  auditLogger,
  AuditEventType,
  dataMasking,
  SensitiveFieldType,
  maskObject,
} from '@smile/common';
import {
  HealthEventType,
  HealthEventData,
  HealthEventMetadata,
  PatientRegistrationData,
  AppointmentData,
  VitalSignsData,
  ClinicalNotificationData,
  LabResultData,
  MedicationData,
  containsHealthPHI,
  PATIENT_REGISTRATION_FIELD_MAPPING,
} from '../types/health-events';

/**
 * Configuration for health event emission
 */
export interface HealthEventServiceConfig {
  rabbitmqUrl: string;
  exchange: string;
  routingKeyPrefix: string;
  facilityId: string;
  facilityName: string;
  departmentId?: string;
  departmentName?: string;
}

/**
 * Service for managing health domain events with PII/PHI compliance
 */
export class HealthEventService {
  private eventEmitter: EventEmitter;
  private readonly config: HealthEventServiceConfig;

  constructor(config: HealthEventServiceConfig) {
    this.config = config;
    this.eventEmitter = new EventEmitter({
      rabbitmqUrl: config.rabbitmqUrl,
      exchange: config.exchange,
    });
  }

  /**
   * Initialize the service by connecting to message broker
   */
  public async initialize(): Promise<void> {
    try {
      await this.eventEmitter.connect();
      logger.info('HealthEventService initialized successfully', {
        facilityId: this.config.facilityId,
        exchange: this.config.exchange,
      });
    } catch (error) {
      logger.error('Failed to initialize HealthEventService', { error });
      throw error;
    }
  }

  /**
   * Emit a health domain event with proper PII/PHI handling
   */
  public async emitHealthEvent<T extends HealthEventData>(
    eventType: HealthEventType,
    eventData: T,
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    try {
      // Create event metadata
      const metadata: HealthEventMetadata = {
        facilityId: this.config.facilityId,
        facilityName: this.config.facilityName,
        ...(this.config.departmentId && { departmentId: this.config.departmentId }),
        ...(this.config.departmentName && { departmentName: this.config.departmentName }),
        userId,
        ...(sessionId && { sessionId }),
        correlationId: correlationId ?? this.generateCorrelationId(),
        source: 'health-service',
        sourceVersion: '1.0.0',
        dataClassification: containsHealthPHI(eventType) ? 'restricted' : 'confidential',
        containsPHI: containsHealthPHI(eventType),
        containsPII: this.containsPII(eventData),
        legalBasis: 'HIPAA-treatment',
        encryptionRequired: containsHealthPHI(eventType),
        eventVersion: '1.0',
        eventSource: 'smile.health-service',
      };

      // Audit the event emission
      auditLogger.logPHIAccess(
        'event-emission',
        this.getResourceId(eventData),
        {
          userId,
          ...(sessionId && { sessionId }),
          correlationId: metadata.correlationId,
          service: 'health-service',
        },
        {
          eventType,
          dataClassification: metadata.dataClassification,
          containsPHI: metadata.containsPHI,
          containsPII: metadata.containsPII,
        },
      );

      // Create the CloudEvent with masked data for external consumption
      const maskedEventData = this.maskSensitiveData(eventType, eventData);

      const cloudEvent: CloudEventV1<any> = {
        specversion: '1.0',
        type: eventType,
        source: metadata.eventSource,
        id: metadata.correlationId,
        time: new Date().toISOString(),
        datacontenttype: 'application/json',
        subject: this.getSubject(eventData),
        data: {
          eventData: maskedEventData,
          metadata,
        },
      };

      // Set routing key based on event type and facility
      const routingKey = `${this.config.routingKeyPrefix}.${eventType}.${this.config.facilityId}`;

      // Emit the event
      await this.eventEmitter.emit(cloudEvent);

      logger.info('Health event emitted successfully', {
        eventType,
        eventId: cloudEvent.id,
        subject: cloudEvent.subject,
        routingKey,
        containsPHI: metadata.containsPHI,
        dataClassification: metadata.dataClassification,
      });

    } catch (error) {
      logger.error('Failed to emit health event', {
        eventType,
        error,
        userId,
        correlationId,
      });

      // Audit the failure
      auditLogger.logSecurityEvent(
        AuditEventType.API_ERROR,
        `Failed to emit health event: ${eventType}`,
        {
          userId,
          ...(sessionId && { sessionId }),
          correlationId: correlationId ?? 'unknown',
          service: 'health-service',
        },
        undefined,
        { eventType, error: error instanceof Error ? error.message : 'Unknown error' },
      );

      throw error;
    }
  }

  /**
   * Emit patient registration event
   */
  public async emitPatientRegistration(
    patientData: PatientRegistrationData,
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    await this.emitHealthEvent(
      HealthEventType.PATIENT_REGISTERED,
      patientData,
      userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Emit appointment scheduling event
   */
  public async emitAppointmentScheduled(
    appointmentData: AppointmentData,
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    await this.emitHealthEvent(
      HealthEventType.APPOINTMENT_SCHEDULED,
      appointmentData,
      userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Emit vital signs recorded event
   */
  public async emitVitalSignsRecorded(
    vitalSignsData: VitalSignsData,
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    await this.emitHealthEvent(
      HealthEventType.VITAL_SIGNS_RECORDED,
      vitalSignsData,
      userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Emit clinical notification event
   */
  public async emitClinicalNotification(
    notificationData: ClinicalNotificationData,
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    await this.emitHealthEvent(
      HealthEventType.NOTIFICATION_SENT,
      notificationData,
      userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Emit lab result available event
   */
  public async emitLabResultAvailable(
    labResultData: LabResultData,
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    await this.emitHealthEvent(
      HealthEventType.LAB_RESULT_AVAILABLE,
      labResultData,
      userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Emit medication prescribed event
   */
  public async emitMedicationPrescribed(
    medicationData: MedicationData,
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    await this.emitHealthEvent(
      HealthEventType.MEDICATION_PRESCRIBED,
      medicationData,
      userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Close connections and cleanup
   */
  public async close(): Promise<void> {
    try {
      await this.eventEmitter.close();
      logger.info('HealthEventService closed successfully');
    } catch (error) {
      logger.error('Error closing HealthEventService', { error });
    }
  }

  // Private helper methods

  private maskSensitiveData<T extends HealthEventData>(
    eventType: HealthEventType,
    eventData: T,
  ): T {
    // Apply specific masking based on event type
    switch (eventType) {
    case HealthEventType.PATIENT_REGISTERED:
    case HealthEventType.PATIENT_UPDATED:
      return maskObject(
          eventData as PatientRegistrationData,
          PATIENT_REGISTRATION_FIELD_MAPPING as Record<keyof PatientRegistrationData, SensitiveFieldType>,
      ) as T;

    case HealthEventType.APPOINTMENT_SCHEDULED:
    case HealthEventType.APPOINTMENT_UPDATED:
      return this.maskAppointmentData(eventData as AppointmentData) as T;

    case HealthEventType.VITAL_SIGNS_RECORDED:
      return this.maskVitalSignsData(eventData as VitalSignsData) as T;

    case HealthEventType.NOTIFICATION_SENT:
      return this.maskNotificationData(eventData as ClinicalNotificationData) as T;

    case HealthEventType.LAB_RESULT_AVAILABLE:
      return this.maskLabResultData(eventData as LabResultData) as T;

    case HealthEventType.MEDICATION_PRESCRIBED:
      return this.maskMedicationData(eventData as MedicationData) as T;

    default:
      // Generic masking for unknown event types
      return this.maskGenericHealthData(eventData);
    }
  }

  private maskAppointmentData(data: AppointmentData): AppointmentData {
    const masked = {
      ...data,
      patientId: dataMasking.pseudonymize(data.patientId),
    };

    if (data.reasonForVisit) {
      masked.reasonForVisit = dataMasking.maskField(data.reasonForVisit, SensitiveFieldType.DIAGNOSIS);
    }

    if (data.notes) {
      masked.notes = dataMasking.maskField(data.notes, SensitiveFieldType.DIAGNOSIS);
    }

    return masked;
  }

  private maskVitalSignsData(data: VitalSignsData): VitalSignsData {
    return {
      ...data,
      patientId: dataMasking.pseudonymize(data.patientId),
      // Vital signs are generally not masked as they're used for clinical decisions
      // but patient ID is pseudonymized
    };
  }

  private maskNotificationData(data: ClinicalNotificationData): ClinicalNotificationData {
    const masked = {
      ...data,
      message: dataMasking.containsSensitiveData(data.message)
        ? dataMasking.maskField(data.message, SensitiveFieldType.DIAGNOSIS)
        : data.message,
    };

    if (data.patientId) {
      masked.patientId = dataMasking.pseudonymize(data.patientId);
    }

    return masked;
  }

  private maskLabResultData(data: LabResultData): LabResultData {
    return {
      ...data,
      patientId: dataMasking.pseudonymize(data.patientId),
      tests: data.tests.map(test => {
        const maskedTest = { ...test };
        if (test.notes) {
          maskedTest.notes = dataMasking.maskField(test.notes, SensitiveFieldType.LAB_RESULT);
        }
        return maskedTest;
      }),
    };
  }

  private maskMedicationData(data: MedicationData): MedicationData {
    const masked = {
      ...data,
      patientId: dataMasking.pseudonymize(data.patientId),
    };

    if (data.indication) {
      masked.indication = dataMasking.maskField(data.indication, SensitiveFieldType.DIAGNOSIS);
    }

    return masked;
  }

  private maskGenericHealthData<T extends HealthEventData>(data: T): T {
    // Generic masking for unknown event types
    const masked = { ...data };

    // Mask any field that contains 'patientId'
    Object.keys(masked).forEach(key => {
      if (key.toLowerCase().includes('patientid') && typeof (masked as any)[key] === 'string') {
        (masked as any)[key] = dataMasking.pseudonymize((masked as any)[key]);
      }
    });

    return masked;
  }

  private containsPII(data: HealthEventData): boolean {
    // Check if the data contains personally identifiable information
    const dataString = JSON.stringify(data);
    return dataMasking.containsSensitiveData(dataString);
  }

  private getResourceId(data: HealthEventData): string {
    // Extract the primary identifier from the event data
    if ('patientId' in data && data.patientId) {
      return data.patientId;
    }
    if ('appointmentId' in data && data.appointmentId) {
      return data.appointmentId;
    }
    if ('recordId' in data && data.recordId) {
      return data.recordId;
    }
    if ('notificationId' in data && data.notificationId) {
      return data.notificationId;
    }
    if ('resultId' in data && (data as any).resultId) {
      return (data as any).resultId;
    }
    if ('medicationId' in data && (data as any).medicationId) {
      return (data as any).medicationId;
    }
    return 'unknown';
  }

  private getSubject(data: HealthEventData): string {
    // Extract the subject for the CloudEvent
    if ('patientId' in data && data.patientId) {
      return `patient/${data.patientId}`;
    }
    if ('appointmentId' in data && data.appointmentId) {
      return `appointment/${data.appointmentId}`;
    }
    if ('recordId' in data && data.recordId) {
      return `vitals/${data.recordId}`;
    }
    if ('notificationId' in data && data.notificationId) {
      return `notification/${data.notificationId}`;
    }
    if ('resultId' in data && (data as any).resultId) {
      return `lab-result/${(data as any).resultId}`;
    }
    if ('medicationId' in data && (data as any).medicationId) {
      return `medication/${(data as any).medicationId}`;
    }
    return 'health/unknown';
  }

  private generateCorrelationId(): string {
    return `health-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}