import request from 'supertest';
import { Express } from 'express';
import { HealthController } from '../health.controller';
import { HealthEventService } from '../../services/health-event.service';
import { createApp } from '../../index';

// Mock the health event service
jest.mock('../../services/health-event.service');

describe('HealthController', () => {
  let app: Express;
  let mockHealthEventService: jest.Mocked<HealthEventService>;

  beforeEach(() => {
    // Create mock service
    mockHealthEventService = {
      emitPatientRegistration: jest.fn().mockResolvedValue(undefined),
      emitAppointmentScheduled: jest.fn().mockResolvedValue(undefined),
      emitVitalSignsRecorded: jest.fn().mockResolvedValue(undefined),
      emitClinicalNotification: jest.fn().mockResolvedValue(undefined),
      emitLabResultAvailable: jest.fn().mockResolvedValue(undefined),
      emitMedicationPrescribed: jest.fn().mockResolvedValue(undefined),
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Create app with mocked service
    app = createApp();

    // Mock the service in the controller
    const healthController = new HealthController(mockHealthEventService);

    // Re-configure routes with mocked controller
    const express = require('express');
    const apiRouter = express.Router();

    // Mock authentication middleware
    apiRouter.use((req: any, _res: any, next: any) => {
      req.user = { id: 'test-user', role: 'healthcare-provider' };
      req.auditContext = { userId: 'test-user', correlationId: 'test-correlation-id' };
      next();
    });

    apiRouter.post('/patients', healthController.registerPatient);
    apiRouter.post('/appointments', healthController.scheduleAppointment);
    apiRouter.post('/vitals', healthController.recordVitalSigns);
    apiRouter.post('/notifications', healthController.sendNotification);
    apiRouter.post('/lab-results', healthController.reportLabResults);
    apiRouter.post('/medications', healthController.prescribeMedication);

    app.use('/api/v1', apiRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/patients', () => {
    const validPatientData = {
      patientId: 'PAT-001',
      mrn: 'MRN123456',
      demographics: {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        gender: 'male',
        race: 'caucasian',
        ethnicity: 'not-hispanic',
        preferredLanguage: 'english',
      },
      contactInfo: {
        primaryPhone: '555-0123',
        email: 'john.doe@example.com',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
        },
      },
      insurance: [{
        planName: 'Health Plan',
        memberId: 'MEM123',
        groupNumber: 'GRP456',
      }],
      facilityId: 'facility-001',
      registrationSource: 'admission',
      registeredBy: 'user-123',
      registrationDate: '2024-01-15T10:00:00Z',
    };

    it('should register a patient successfully', async () => {
      const response = await request(app)
        .post('/api/v1/patients')
        .send(validPatientData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Patient registered successfully');
      expect(response.body).toHaveProperty('correlationId');
      expect(mockHealthEventService.emitPatientRegistration).toHaveBeenCalledWith(
        validPatientData,
        'test-user',
        'test-correlation-id',
        undefined,
      );
    });

    it('should return 400 for invalid patient data', async () => {
      const invalidData = { ...validPatientData };
      delete (invalidData as any).patientId;

      const response = await request(app)
        .post('/api/v1/patients')
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation Error');
      expect(mockHealthEventService.emitPatientRegistration).not.toHaveBeenCalled();
    });

    it('should handle service errors gracefully', async () => {
      mockHealthEventService.emitPatientRegistration.mockRejectedValue(
        new Error('Service unavailable'),
      );

      const response = await request(app)
        .post('/api/v1/patients')
        .send(validPatientData)
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');
    });
  });

  describe('POST /api/v1/appointments', () => {
    const validAppointmentData = {
      appointmentId: 'APT-001',
      patientId: 'PAT-001',
      providerId: 'PROV-001',
      facilityId: 'facility-001',
      appointmentType: 'consultation',
      scheduledDateTime: '2024-01-20T10:00:00Z',
      duration: 30,
      status: 'scheduled',
      reasonForVisit: 'Annual checkup',
      scheduledBy: 'user-123',
      scheduleDate: '2024-01-15T10:00:00Z',
    };

    it('should schedule an appointment successfully', async () => {
      const response = await request(app)
        .post('/api/v1/appointments')
        .send(validAppointmentData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Appointment scheduled successfully');
      expect(mockHealthEventService.emitAppointmentScheduled).toHaveBeenCalled();
    });

    it('should return 400 for missing required fields', async () => {
      const invalidData = { ...validAppointmentData };
      delete (invalidData as any).appointmentId;

      await request(app)
        .post('/api/v1/appointments')
        .send(invalidData)
        .expect(400);

      expect(mockHealthEventService.emitAppointmentScheduled).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/vitals', () => {
    const validVitalsData = {
      recordId: 'VIT-001',
      patientId: 'PAT-001',
      vitals: {
        temperature: { value: 98.6, unit: 'F' },
        bloodPressure: {
          systolic: 120,
          diastolic: 80,
          unit: 'mmHg',
        },
        heartRate: { value: 72, unit: 'bpm' },
        respiratoryRate: { value: 16, unit: 'breaths/min' },
      },
      measurementTime: '2024-01-15T10:00:00Z',
      facilityId: 'facility-001',
      recordedBy: 'user-123',
    };

    it('should record vital signs successfully', async () => {
      const response = await request(app)
        .post('/api/v1/vitals')
        .send(validVitalsData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Vital signs recorded successfully');
      expect(mockHealthEventService.emitVitalSignsRecorded).toHaveBeenCalled();
    });

    it('should validate vital signs ranges', async () => {
      const invalidData = {
        ...validVitalsData,
        vitals: {
          ...validVitalsData.vitals,
          temperature: { value: 150, unit: 'F' }, // Invalid temperature
        },
      };

      await request(app)
        .post('/api/v1/vitals')
        .send(invalidData)
        .expect(400);
    });
  });

  describe('POST /api/v1/notifications', () => {
    const validNotificationData = {
      notificationId: 'NOT-001',
      patientId: 'PAT-001',
      recipientId: 'PROV-001',
      recipientType: 'provider',
      type: 'appointment-reminder',
      priority: 'medium',
      message: 'Your appointment is tomorrow at 10 AM',
      channel: 'email',
      status: 'pending',
      createdAt: '2024-01-15T10:00:00Z',
      createdBy: 'user-123',
    };

    it('should send notification successfully', async () => {
      const response = await request(app)
        .post('/api/v1/notifications')
        .send(validNotificationData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Notification sent successfully');
      expect(mockHealthEventService.emitClinicalNotification).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/lab-results', () => {
    const validLabResultData = {
      resultId: 'LAB-001',
      patientId: 'PAT-001',
      orderId: 'ORD-001',
      tests: [{
        testId: 'TEST-001',
        testName: 'Complete Blood Count',
        testCode: 'CBC',
        result: 'Normal',
        status: 'normal',
      }],
      facilityId: 'facility-001',
      orderingProvider: 'PROV-001',
      resultDate: '2024-01-15T10:00:00Z',
      reportedBy: 'user-123',
    };

    it('should report lab results successfully', async () => {
      const response = await request(app)
        .post('/api/v1/lab-results')
        .send(validLabResultData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Lab results reported successfully');
      expect(mockHealthEventService.emitLabResultAvailable).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/medications', () => {
    const validMedicationData = {
      medicationId: 'MED-001',
      patientId: 'PAT-001',
      prescriberId: 'PROV-001',
      prescriptionDate: '2024-01-15T10:00:00Z',
      medication: {
        name: 'Lisinopril',
        strength: '10mg',
        form: 'tablet',
      },
      dosage: {
        amount: '1',
        frequency: 'daily',
        route: 'oral',
      },
      facilityId: 'facility-001',
    };

    it('should prescribe medication successfully', async () => {
      const response = await request(app)
        .post('/api/v1/medications')
        .send(validMedicationData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Medication prescribed successfully');
      expect(mockHealthEventService.emitMedicationPrescribed).toHaveBeenCalled();
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('service', 'health-service');
    });
  });
});