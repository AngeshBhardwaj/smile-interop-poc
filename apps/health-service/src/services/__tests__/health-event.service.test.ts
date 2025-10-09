import { HealthEventService, HealthEventServiceConfig } from '../health-event.service';
import { HealthEventType } from '../../types/health-events';
import { EventEmitter } from '@smile/cloud-events';
import { auditLogger } from '@smile/common';

// Mock dependencies
jest.mock('@smile/cloud-events');
jest.mock('@smile/common', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
  auditLogger: {
    logPHIAccess: jest.fn(),
    logSecurityEvent: jest.fn(),
    createContextFromRequest: jest.fn(),
  },
  dataMasking: {
    pseudonymize: jest.fn((value) => `masked_${value}`),
    maskField: jest.fn((value) => `***${value.slice(-3)}`),
    containsSensitiveData: jest.fn(() => true),
  },
  AuditEventType: {
    PHI_ACCESS: 'compliance.phi.access',
    API_ERROR: 'api.error',
  },
  SensitiveFieldType: {
    DIAGNOSIS: 'diagnosis',
    LAB_RESULT: 'lab_result',
  },
}));

describe('HealthEventService', () => {
  let service: HealthEventService;
  let mockEventEmitter: jest.Mocked<EventEmitter>;
  let config: HealthEventServiceConfig;

  beforeEach(() => {
    // Create mock event emitter
    mockEventEmitter = {
      connect: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock EventEmitter constructor
    (EventEmitter as jest.MockedClass<typeof EventEmitter>).mockImplementation(() => mockEventEmitter);

    config = {
      rabbitmqUrl: 'amqp://test:test@localhost:5672',
      exchange: 'test.events',
      routingKeyPrefix: 'test',
      facilityId: 'test-facility',
      facilityName: 'Test Facility',
      departmentId: 'test-dept',
      departmentName: 'Test Department',
    };

    service = new HealthEventService(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await service.initialize();

      expect(mockEventEmitter.connect).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      mockEventEmitter.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(service.initialize()).rejects.toThrow('Connection failed');
    });
  });

  describe('emitPatientRegistration', () => {
    const patientData = {
      patientId: 'PAT-001',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-15',
      gender: 'male' as const,
      phoneNumber: '555-0123',
      email: 'john.doe@example.com',
      address: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        country: 'USA',
      },
      insurance: {
        provider: 'Health Plan',
        policyNumber: 'POL123',
        memberId: 'MEM123',
        groupNumber: 'GRP456',
      },
      registrationDate: '2024-01-15T10:00:00Z',
      facilityId: 'facility-001',
      registeredBy: 'user-123',
      status: 'active' as const,
    };

    beforeEach(async () => {
      await service.initialize();
    });

    it('should emit patient registration event successfully', async () => {
      await service.emitPatientRegistration(
        patientData,
        'user-123',
        'correlation-123',
        'session-123'
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          specversion: '1.0',
          type: HealthEventType.PATIENT_REGISTERED,
          source: 'smile.health-service',
          id: 'correlation-123',
          time: expect.any(String),
          datacontenttype: 'application/json',
          subject: 'patient/PAT-001',
          data: expect.objectContaining({
            eventData: expect.any(Object),
            metadata: expect.objectContaining({
              facilityId: 'test-facility',
              facilityName: 'Test Facility',
              userId: 'user-123',
              correlationId: 'correlation-123',
              containsPHI: true,
              dataClassification: 'restricted',
            }),
          }),
        })
      );

      expect(auditLogger.logPHIAccess).toHaveBeenCalledWith(
        'event-emission',
        'PAT-001',
        expect.objectContaining({
          userId: 'user-123',
          sessionId: 'session-123',
          correlationId: 'correlation-123',
          service: 'health-service',
        }),
        expect.any(Object)
      );
    });

    it('should generate correlation ID when not provided', async () => {
      await service.emitPatientRegistration(patientData, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent?.id).toMatch(/^health-\\d+-[a-z0-9]+$/);
    });

    it('should mask sensitive data in events', async () => {
      await service.emitPatientRegistration(patientData, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      const maskedData = emittedEvent?.data?.eventData;

      // Check that PII fields are masked
      expect(maskedData.patientId).toBe('masked_PAT-001');
    });

    it('should handle emit errors and log security events', async () => {
      mockEventEmitter.emit.mockRejectedValue(new Error('Emit failed'));

      await expect(
        service.emitPatientRegistration(patientData, 'user-123', 'correlation-123')
      ).rejects.toThrow('Emit failed');

      expect(auditLogger.logSecurityEvent).toHaveBeenCalledWith(
        'api.error',
        expect.stringContaining('Failed to emit health event'),
        expect.objectContaining({
          userId: 'user-123',
          correlationId: 'correlation-123',
          service: 'health-service',
        }),
        undefined,
        expect.objectContaining({
          eventType: HealthEventType.PATIENT_REGISTERED,
          error: 'Emit failed',
        })
      );
    });

    it('should handle optional department fields correctly', async () => {
      const configWithoutDept = {
        rabbitmqUrl: config.rabbitmqUrl,
        exchange: config.exchange,
        routingKeyPrefix: config.routingKeyPrefix,
        facilityId: config.facilityId,
        facilityName: config.facilityName,
      };
      const serviceWithoutDept = new HealthEventService(configWithoutDept);
      await serviceWithoutDept.initialize();

      await serviceWithoutDept.emitPatientRegistration(patientData, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      const metadata = emittedEvent?.data?.metadata;

      expect(metadata).not.toHaveProperty('departmentId');
      expect(metadata).not.toHaveProperty('departmentName');
    });
  });

  describe('appointment events', () => {
    const appointmentData = {
      appointmentId: 'APT-001',
      patientId: 'PAT-001',
      providerId: 'PROV-001',
      appointmentDateTime: '2024-01-20T10:00:00Z',
      appointmentType: 'consultation' as const,
      duration: 30,
      status: 'scheduled' as const,
      reasonForVisit: 'Annual checkup',
      facilityId: 'facility-001',
      scheduledBy: 'user-123',
      scheduledDate: '2024-01-15T10:00:00Z',
      lastModified: '2024-01-15T10:00:00Z',
      lastModifiedBy: 'user-123',
      location: {
        facilityId: 'facility-001',
        facilityName: 'Test Facility',
        room: 'Room 101',
      },
    };

    beforeEach(async () => {
      await service.initialize();
    });

    it('should emit appointment scheduled event', async () => {
      await service.emitAppointmentScheduled(appointmentData, 'user-123');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: HealthEventType.APPOINTMENT_SCHEDULED,
          subject: 'appointment/APT-001',
        })
      );
    });

    it('should mask sensitive appointment data', async () => {
      await service.emitAppointmentScheduled(appointmentData, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      const maskedData = emittedEvent?.data?.eventData;

      expect(maskedData.patientId).toBe('masked_PAT-001');
      expect(maskedData.reasonForVisit).toBe('***kup');
    });
  });

  describe('vital signs events', () => {
    const vitalSignsData = {
      recordId: 'VIT-001',
      patientId: 'PAT-001',
      vitalSigns: {
        temperature: { value: 98.6, unit: 'fahrenheit' as const },
        bloodPressure: { systolic: 120, diastolic: 80, unit: 'mmHg' as const },
        heartRate: { value: 72, unit: 'bpm' as const },
      },
      recordedDateTime: '2024-01-15T10:00:00Z',
      facilityId: 'facility-001',
      recordedBy: 'user-123',
      deviceInfo: {
        deviceId: 'DEV-001',
        deviceType: 'vital-signs-monitor',
      },
    };

    beforeEach(async () => {
      await service.initialize();
    });

    it('should emit vital signs recorded event', async () => {
      await service.emitVitalSignsRecorded(vitalSignsData, 'user-123');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: HealthEventType.VITAL_SIGNS_RECORDED,
          subject: 'vitals/VIT-001',
        })
      );
    });

    it('should pseudonymize patient ID in vital signs', async () => {
      await service.emitVitalSignsRecorded(vitalSignsData, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      const maskedData = emittedEvent?.data?.eventData;

      expect(maskedData.patientId).toBe('masked_PAT-001');
      // Vital signs values should not be masked as they're clinical data
      expect(maskedData.vitalSigns.temperature.value).toBe(98.6);
    });
  });

  describe('close', () => {
    it('should close event emitter successfully', async () => {
      await service.close();

      expect(mockEventEmitter.close).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      mockEventEmitter.close.mockRejectedValue(new Error('Close failed'));

      await expect(service.close()).resolves.not.toThrow();
    });
  });

  describe('private helper methods', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should generate proper correlation IDs', async () => {
      const simplePatientData = {
        patientId: 'PAT-001',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        gender: 'male' as const,
        registrationDate: '2024-01-15T10:00:00Z',
        facilityId: 'facility-001',
        registeredBy: 'user-123',
        status: 'active' as const,
      };

      await service.emitPatientRegistration(simplePatientData, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent?.id).toMatch(/^health-\\d+-[a-z0-9]+$/);
    });

    it('should extract resource IDs correctly', async () => {
      const simplePatientData = {
        patientId: 'PAT-001',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        gender: 'male' as const,
        registrationDate: '2024-01-15T10:00:00Z',
        facilityId: 'facility-001',
        registeredBy: 'user-123',
        status: 'active' as const,
      };

      await service.emitPatientRegistration(simplePatientData, 'user-123');

      expect(auditLogger.logPHIAccess).toHaveBeenCalledWith(
        'event-emission',
        'PAT-001', // Should extract patientId as resource ID
        expect.any(Object),
        expect.any(Object)
      );
    });
  });
});