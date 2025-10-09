import { Request, Response } from 'express';
import Joi from 'joi';
import {
  logger,
  auditLogger,
  AuditEventType,
} from '@smile/common';
import { HealthEventService } from '../services/health-event.service';
import {
  PatientRegistrationData,
  AppointmentData,
  VitalSignsData,
  ClinicalNotificationData,
  LabResultData,
  MedicationData,
} from '../types/health-events';
import { AuditRequest } from '../middleware/security.middleware';

/**
 * Health domain controller for HIPAA-compliant health events
 */
export class HealthController {
  constructor(private healthEventService: HealthEventService) {}

  /**
   * @swagger
   * /api/v1/patients:
   *   post:
   *     summary: Register a new patient
   *     tags: [Patients]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [patientId, firstName, lastName, dateOfBirth, gender, registrationDate, facilityId, registeredBy, status]
   *             properties:
   *               patientId:
   *                 type: string
   *                 example: "PAT-TEST-001"
   *               firstName:
   *                 type: string
   *                 example: "John"
   *               lastName:
   *                 type: string
   *                 example: "Doe"
   *               dateOfBirth:
   *                 type: string
   *                 format: date
   *                 example: "1990-01-15"
   *               gender:
   *                 type: string
   *                 enum: [male, female, other]
   *                 example: "male"
   *               phoneNumber:
   *                 type: string
   *                 example: "555-0123"
   *               email:
   *                 type: string
   *                 format: email
   *                 example: "john.doe@example.com"
   *               registrationDate:
   *                 type: string
   *                 format: date-time
   *                 example: "2024-01-15T10:00:00Z"
   *               facilityId:
   *                 type: string
   *                 example: "facility-001"
   *               registeredBy:
   *                 type: string
   *                 example: "user-123"
   *               status:
   *                 type: string
   *                 enum: [active, inactive]
   *                 example: "active"
   *     responses:
   *       201:
   *         description: Patient registered successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                 patientId:
   *                   type: string
   *                 registrationDate:
   *                   type: string
   *                 correlationId:
   *                   type: string
   *                 timestamp:
   *                   type: string
   *       400:
   *         description: Validation error
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Insufficient permissions
   */
  public registerPatient = async (req: AuditRequest, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validationResult = this.validatePatientRegistration(req.body);
      if (validationResult.error) {
        res.status(400).json({
          error: 'Validation failed',
          details: validationResult.error.details,
          correlationId: req.auditContext?.correlationId,
        });
        return;
      }

      const patientData: PatientRegistrationData = validationResult.value;
      const user = (req as any).user;

      // Audit PHI access
      auditLogger.logPHIAccess(
        'patient-registration',
        patientData.patientId,
        auditLogger.createContextFromRequest(req),
        {
          patientName: `${patientData.firstName} ${patientData.lastName}`,
          facilityId: patientData.facilityId,
        },
      );

      // Emit patient registration event
      await this.healthEventService.emitPatientRegistration(
        patientData,
        user.id,
        req.auditContext?.correlationId,
        req.auditContext?.sessionId,
      );

      // Return success response (with minimal data to avoid PHI exposure)
      res.status(201).json({
        message: 'Patient registered successfully',
        patientId: patientData.patientId,
        registrationDate: patientData.registrationDate,
        correlationId: req.auditContext?.correlationId,
        timestamp: new Date().toISOString(),
      });

      logger.info('Patient registration completed', {
        patientId: patientData.patientId,
        facilityId: patientData.facilityId,
        correlationId: req.auditContext?.correlationId,
        userId: user.id,
      });

    } catch (error) {
      logger.error('Patient registration failed', {
        error,
        correlationId: req.auditContext?.correlationId,
      });

      res.status(500).json({
        error: 'Patient registration failed',
        message: 'An error occurred while registering the patient',
        correlationId: req.auditContext?.correlationId,
      });
    }
  };

  /**
   * @swagger
   * /api/v1/appointments:
   *   post:
   *     summary: Schedule an appointment
   *     tags: [Appointments]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [appointmentId, patientId, providerId, appointmentDateTime, appointmentType, facilityId, scheduledBy]
   *             properties:
   *               appointmentId:
   *                 type: string
   *                 example: "APT-001"
   *               patientId:
   *                 type: string
   *                 example: "PAT-001"
   *               providerId:
   *                 type: string
   *                 example: "PROV-001"
   *               appointmentDateTime:
   *                 type: string
   *                 format: date-time
   *                 example: "2024-01-20T10:00:00Z"
   *               appointmentType:
   *                 type: string
   *                 enum: [consultation, followup, procedure, emergency]
   *                 example: "consultation"
   *               duration:
   *                 type: number
   *                 example: 30
   *               status:
   *                 type: string
   *                 enum: [scheduled, confirmed, cancelled, completed]
   *                 example: "scheduled"
   *               reasonForVisit:
   *                 type: string
   *                 example: "Annual checkup"
   *               facilityId:
   *                 type: string
   *                 example: "facility-001"
   *               scheduledBy:
   *                 type: string
   *                 example: "user-123"
   *     responses:
   *       201:
   *         description: Appointment scheduled successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Insufficient permissions
   */
  public scheduleAppointment = async (req: AuditRequest, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validationResult = this.validateAppointmentScheduling(req.body);
      if (validationResult.error) {
        res.status(400).json({
          error: 'Validation failed',
          details: validationResult.error.details,
          correlationId: req.auditContext?.correlationId,
        });
        return;
      }

      const appointmentData: AppointmentData = validationResult.value;
      const user = (req as any).user;

      // Audit PHI access
      auditLogger.logPHIAccess(
        'appointment-scheduling',
        appointmentData.appointmentId,
        auditLogger.createContextFromRequest(req),
        {
          patientId: appointmentData.patientId,
          providerId: appointmentData.providerId,
          appointmentType: appointmentData.appointmentType,
        },
      );

      // Emit appointment scheduled event
      await this.healthEventService.emitAppointmentScheduled(
        appointmentData,
        user.id,
        req.auditContext?.correlationId,
        req.auditContext?.sessionId,
      );

      res.status(201).json({
        message: 'Appointment scheduled successfully',
        appointmentId: appointmentData.appointmentId,
        appointmentDateTime: appointmentData.appointmentDateTime,
        status: appointmentData.status,
        correlationId: req.auditContext?.correlationId,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Appointment scheduling failed', {
        error,
        correlationId: req.auditContext?.correlationId,
      });

      res.status(500).json({
        error: 'Appointment scheduling failed',
        message: 'An error occurred while scheduling the appointment',
        correlationId: req.auditContext?.correlationId,
      });
    }
  };

  /**
   * @swagger
   * /api/v1/vitals:
   *   post:
   *     summary: Record vital signs
   *     tags: [Vitals]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [recordId, patientId, vitalSigns, recordedDateTime, facilityId, recordedBy]
   *             properties:
   *               recordId:
   *                 type: string
   *                 example: "VIT-001"
   *               patientId:
   *                 type: string
   *                 example: "PAT-001"
   *               vitalSigns:
   *                 type: object
   *                 properties:
   *                   temperature:
   *                     type: object
   *                     properties:
   *                       value:
   *                         type: number
   *                         example: 98.6
   *                       unit:
   *                         type: string
   *                         example: "F"
   *                   bloodPressure:
   *                     type: object
   *                     properties:
   *                       systolic:
   *                         type: number
   *                         example: 120
   *                       diastolic:
   *                         type: number
   *                         example: 80
   *                       unit:
   *                         type: string
   *                         example: "mmHg"
   *                   heartRate:
   *                     type: object
   *                     properties:
   *                       value:
   *                         type: number
   *                         example: 72
   *                       unit:
   *                         type: string
   *                         example: "bpm"
   *                   respiratoryRate:
   *                     type: object
   *                     properties:
   *                       value:
   *                         type: number
   *                         example: 16
   *                       unit:
   *                         type: string
   *                         example: "breaths/min"
   *                   oxygenSaturation:
   *                     type: object
   *                     properties:
   *                       value:
   *                         type: number
   *                         example: 98
   *                       unit:
   *                         type: string
   *                         example: "%"
   *               recordedDateTime:
   *                 type: string
   *                 format: date-time
   *                 example: "2024-01-15T10:00:00Z"
   *               facilityId:
   *                 type: string
   *                 example: "facility-001"
   *               recordedBy:
   *                 type: string
   *                 example: "user-123"
   *               deviceInfo:
   *                 type: object
   *                 properties:
   *                   deviceId:
   *                     type: string
   *                     example: "DEV-001"
   *                   deviceType:
   *                     type: string
   *                     example: "vital-signs-monitor"
   *                   manufacturer:
   *                     type: string
   *                     example: "MedDevice Corp"
   *               notes:
   *                 type: string
   *                 example: "Patient was resting during measurement"
   *     responses:
   *       201:
   *         description: Vital signs recorded successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Insufficient permissions
   */
  public recordVitalSigns = async (req: AuditRequest, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validationResult = this.validateVitalSigns(req.body);
      if (validationResult.error) {
        res.status(400).json({
          error: 'Validation failed',
          details: validationResult.error.details,
          correlationId: req.auditContext?.correlationId,
        });
        return;
      }

      const vitalSignsData: VitalSignsData = validationResult.value;
      const user = (req as any).user;

      // Audit PHI access
      auditLogger.logPHIAccess(
        'vital-signs-recording',
        vitalSignsData.recordId,
        auditLogger.createContextFromRequest(req),
        {
          patientId: vitalSignsData.patientId,
          recordedBy: vitalSignsData.recordedBy,
        },
      );

      // Emit vital signs recorded event
      await this.healthEventService.emitVitalSignsRecorded(
        vitalSignsData,
        user.id,
        req.auditContext?.correlationId,
        req.auditContext?.sessionId,
      );

      res.status(201).json({
        message: 'Vital signs recorded successfully',
        recordId: vitalSignsData.recordId,
        recordedDateTime: vitalSignsData.recordedDateTime,
        correlationId: req.auditContext?.correlationId,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Vital signs recording failed', {
        error,
        correlationId: req.auditContext?.correlationId,
      });

      res.status(500).json({
        error: 'Vital signs recording failed',
        message: 'An error occurred while recording vital signs',
        correlationId: req.auditContext?.correlationId,
      });
    }
  };

  /**
   * @swagger
   * /api/v1/notifications:
   *   post:
   *     summary: Send clinical notification
   *     tags: [Notifications]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [notificationId, type, recipientType, recipientId, message, sentBy, facilityId]
   *             properties:
   *               notificationId:
   *                 type: string
   *                 example: "NOT-001"
   *               type:
   *                 type: string
   *                 enum: [alert, reminder, update, emergency, result]
   *                 example: "alert"
   *               recipientType:
   *                 type: string
   *                 enum: [patient, provider, staff, external]
   *                 example: "provider"
   *               recipientId:
   *                 type: string
   *                 example: "PROV-001"
   *               message:
   *                 type: string
   *                 example: "Lab results are ready for review"
   *               priority:
   *                 type: string
   *                 enum: [low, normal, high, urgent]
   *                 example: "normal"
   *               patientId:
   *                 type: string
   *                 example: "PAT-001"
   *               relatedRecord:
   *                 type: object
   *                 properties:
   *                   recordType:
   *                     type: string
   *                     example: "lab-result"
   *                   recordId:
   *                     type: string
   *                     example: "LAB-001"
   *               sentDateTime:
   *                 type: string
   *                 format: date-time
   *                 example: "2024-01-15T10:00:00Z"
   *               sentBy:
   *                 type: string
   *                 example: "user-123"
   *               facilityId:
   *                 type: string
   *                 example: "facility-001"
   *               readStatus:
   *                 type: string
   *                 enum: [unread, read, acknowledged]
   *                 example: "unread"
   *               expiryDateTime:
   *                 type: string
   *                 format: date-time
   *                 example: "2024-01-30T10:00:00Z"
   *     responses:
   *       201:
   *         description: Notification sent successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Insufficient permissions
   */
  public sendNotification = async (req: AuditRequest, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validationResult = this.validateNotification(req.body);
      if (validationResult.error) {
        res.status(400).json({
          error: 'Validation failed',
          details: validationResult.error.details,
          correlationId: req.auditContext?.correlationId,
        });
        return;
      }

      const notificationData: ClinicalNotificationData = validationResult.value;
      const user = (req as any).user;

      // Audit notification sending
      auditLogger.logEvent(
        AuditEventType.API_REQUEST,
        'Clinical notification sent',
        auditLogger.createContextFromRequest(req),
        {
          resourceType: 'notification',
          resourceId: notificationData.notificationId,
          action: 'send-notification',
          details: {
            recipientType: notificationData.recipientType,
            type: notificationData.type,
            priority: notificationData.priority,
          },
        },
      );

      // Emit notification sent event
      await this.healthEventService.emitClinicalNotification(
        notificationData,
        user.id,
        req.auditContext?.correlationId,
        req.auditContext?.sessionId,
      );

      res.status(201).json({
        message: 'Clinical notification sent successfully',
        notificationId: notificationData.notificationId,
        recipientType: notificationData.recipientType,
        type: notificationData.type,
        correlationId: req.auditContext?.correlationId,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Clinical notification failed', {
        error,
        correlationId: req.auditContext?.correlationId,
      });

      res.status(500).json({
        error: 'Clinical notification failed',
        message: 'An error occurred while sending the notification',
        correlationId: req.auditContext?.correlationId,
      });
    }
  };

  /**
   * @swagger
   * /api/v1/lab-results:
   *   post:
   *     summary: Report lab results
   *     tags: [Lab Results]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [resultId, patientId, orderId, labName, testName, resultDateTime, reportedBy, facilityId]
   *             properties:
   *               resultId:
   *                 type: string
   *                 example: "LAB-001"
   *               patientId:
   *                 type: string
   *                 example: "PAT-001"
   *               orderId:
   *                 type: string
   *                 example: "ORD-001"
   *               labName:
   *                 type: string
   *                 example: "City Medical Lab"
   *               testName:
   *                 type: string
   *                 example: "Complete Blood Count"
   *               testCode:
   *                 type: string
   *                 example: "CBC"
   *               specimen:
   *                 type: object
   *                 properties:
   *                   type:
   *                     type: string
   *                     example: "blood"
   *                   collectionDateTime:
   *                     type: string
   *                     format: date-time
   *                     example: "2024-01-14T08:00:00Z"
   *                   volume:
   *                     type: string
   *                     example: "5ml"
   *               results:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     testComponent:
   *                       type: string
   *                       example: "White Blood Cells"
   *                     value:
   *                       type: string
   *                       example: "7.2"
   *                     unit:
   *                       type: string
   *                       example: "K/uL"
   *                     referenceRange:
   *                       type: string
   *                       example: "4.0-11.0"
   *                     status:
   *                       type: string
   *                       enum: [normal, abnormal, critical, pending]
   *                       example: "normal"
   *                     comments:
   *                       type: string
   *                       example: "Within normal limits"
   *               overallStatus:
   *                 type: string
   *                 enum: [completed, partial, pending, cancelled]
   *                 example: "completed"
   *               resultDateTime:
   *                 type: string
   *                 format: date-time
   *                 example: "2024-01-15T10:00:00Z"
   *               reportedBy:
   *                 type: string
   *                 example: "lab-tech-001"
   *               reviewedBy:
   *                 type: string
   *                 example: "dr-smith"
   *               facilityId:
   *                 type: string
   *                 example: "facility-001"
   *               criticalFlags:
   *                 type: array
   *                 items:
   *                   type: string
   *                 example: ["high_glucose"]
   *               clinicalComments:
   *                 type: string
   *                 example: "Patient should follow up with primary care"
   *     responses:
   *       201:
   *         description: Lab results reported successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Insufficient permissions
   */
  public reportLabResults = async (req: AuditRequest, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validationResult = this.validateLabResults(req.body);
      if (validationResult.error) {
        res.status(400).json({
          error: 'Validation failed',
          details: validationResult.error.details,
          correlationId: req.auditContext?.correlationId,
        });
        return;
      }

      const labResultData: LabResultData = validationResult.value;
      const user = (req as any).user;

      // Audit PHI access for lab results
      auditLogger.logPHIAccess(
        'lab-results-reporting',
        labResultData.resultId,
        auditLogger.createContextFromRequest(req),
        {
          patientId: labResultData.patientId,
          orderId: labResultData.orderId,
          labName: labResultData.labName,
          overallStatus: labResultData.overallStatus,
        },
      );

      // Emit lab result available event
      await this.healthEventService.emitLabResultAvailable(
        labResultData,
        user.id,
        req.auditContext?.correlationId,
        req.auditContext?.sessionId,
      );

      res.status(201).json({
        message: 'Lab results reported successfully',
        resultId: labResultData.resultId,
        overallStatus: labResultData.overallStatus,
        reportedDateTime: labResultData.reportedDateTime,
        correlationId: req.auditContext?.correlationId,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Lab results reporting failed', {
        error,
        correlationId: req.auditContext?.correlationId,
      });

      res.status(500).json({
        error: 'Lab results reporting failed',
        message: 'An error occurred while reporting lab results',
        correlationId: req.auditContext?.correlationId,
      });
    }
  };

  /**
   * @swagger
   * /api/v1/medications:
   *   post:
   *     summary: Prescribe medication
   *     tags: [Medications]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [medicationId, patientId, prescriberId, medication, dosage, instructions, prescriptionDate, facilityId]
   *             properties:
   *               medicationId:
   *                 type: string
   *                 example: "MED-001"
   *               patientId:
   *                 type: string
   *                 example: "PAT-001"
   *               prescriberId:
   *                 type: string
   *                 example: "PROV-001"
   *               medication:
   *                 type: object
   *                 properties:
   *                   name:
   *                     type: string
   *                     example: "Amoxicillin"
   *                   genericName:
   *                     type: string
   *                     example: "Amoxicillin"
   *                   brandName:
   *                     type: string
   *                     example: "Amoxil"
   *                   strength:
   *                     type: string
   *                     example: "500mg"
   *                   form:
   *                     type: string
   *                     example: "tablet"
   *                   ndc:
   *                     type: string
   *                     example: "12345-678-90"
   *               dosage:
   *                 type: object
   *                 properties:
   *                   amount:
   *                     type: string
   *                     example: "500mg"
   *                   frequency:
   *                     type: string
   *                     example: "twice daily"
   *                   route:
   *                     type: string
   *                     example: "oral"
   *                   duration:
   *                     type: string
   *                     example: "10 days"
   *               instructions:
   *                 type: string
   *                 example: "Take with food. Complete full course."
   *               quantity:
   *                 type: number
   *                 example: 20
   *               refills:
   *                 type: number
   *                 example: 0
   *               prescriptionDate:
   *                 type: string
   *                 format: date-time
   *                 example: "2024-01-15T10:00:00Z"
   *               startDate:
   *                 type: string
   *                 format: date-time
   *                 example: "2024-01-15T10:00:00Z"
   *               endDate:
   *                 type: string
   *                 format: date-time
   *                 example: "2024-01-25T10:00:00Z"
   *               facilityId:
   *                 type: string
   *                 example: "facility-001"
   *               indication:
   *                 type: string
   *                 example: "Bacterial infection"
   *               allergies:
   *                 type: array
   *                 items:
   *                   type: string
   *                 example: ["penicillin"]
   *               interactions:
   *                 type: array
   *                 items:
   *                   type: string
   *                 example: ["warfarin"]
   *               status:
   *                 type: string
   *                 enum: [active, discontinued, completed, suspended]
   *                 example: "active"
   *               priority:
   *                 type: string
   *                 enum: [routine, urgent, stat]
   *                 example: "routine"
   *     responses:
   *       201:
   *         description: Medication prescribed successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Insufficient permissions
   */
  public prescribeMedication = async (req: AuditRequest, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validationResult = this.validateMedication(req.body);
      if (validationResult.error) {
        res.status(400).json({
          error: 'Validation failed',
          details: validationResult.error.details,
          correlationId: req.auditContext?.correlationId,
        });
        return;
      }

      const medicationData: MedicationData = validationResult.value;
      const user = (req as any).user;

      // Audit PHI access for medication prescription
      auditLogger.logPHIAccess(
        'medication-prescription',
        medicationData.medicationId,
        auditLogger.createContextFromRequest(req),
        {
          patientId: medicationData.patientId,
          prescriberId: medicationData.prescriberId,
          medicationName: medicationData.medication.name,
        },
      );

      // Emit medication prescribed event
      await this.healthEventService.emitMedicationPrescribed(
        medicationData,
        user.id,
        req.auditContext?.correlationId,
        req.auditContext?.sessionId,
      );

      res.status(201).json({
        message: 'Medication prescribed successfully',
        medicationId: medicationData.medicationId,
        medicationName: medicationData.medication.name,
        status: medicationData.status,
        correlationId: req.auditContext?.correlationId,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Medication prescription failed', {
        error,
        correlationId: req.auditContext?.correlationId,
      });

      res.status(500).json({
        error: 'Medication prescription failed',
        message: 'An error occurred while prescribing medication',
        correlationId: req.auditContext?.correlationId,
      });
    }
  };

  /**
   * Health check endpoint
   * GET /api/v1/health
   */
  public healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(200).json({
        status: 'healthy',
        service: 'health-service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        correlationId: (req as AuditRequest).auditContext?.correlationId,
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: 'Service unavailable',
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Private validation methods

  private validatePatientRegistration(data: any): Joi.ValidationResult {
    const schema = Joi.object({
      patientId: Joi.string().required(),
      externalPatientId: Joi.string().optional(),
      firstName: Joi.string().required(),
      lastName: Joi.string().required(),
      dateOfBirth: Joi.date().iso().required(),
      gender: Joi.string().valid('male', 'female', 'other', 'unknown').required(),
      phoneNumber: Joi.string().optional(),
      email: Joi.string().email().optional(),
      address: Joi.object({
        street: Joi.string().required(),
        city: Joi.string().required(),
        state: Joi.string().required(),
        zipCode: Joi.string().required(),
        country: Joi.string().required(),
      }).optional(),
      emergencyContact: Joi.object({
        name: Joi.string().required(),
        relationship: Joi.string().required(),
        phoneNumber: Joi.string().required(),
      }).optional(),
      insurance: Joi.object({
        provider: Joi.string().required(),
        policyNumber: Joi.string().required(),
        groupNumber: Joi.string().optional(),
        memberId: Joi.string().required(),
      }).optional(),
      registrationDate: Joi.date().iso().default(() => new Date()),
      facilityId: Joi.string().required(),
      registeredBy: Joi.string().required(),
      status: Joi.string().valid('active', 'inactive', 'deceased', 'merged').default('active'),
    });

    return schema.validate(data);
  }

  private validateAppointmentScheduling(data: any): Joi.ValidationResult {
    const schema = Joi.object({
      appointmentId: Joi.string().required(),
      patientId: Joi.string().required(),
      providerId: Joi.string().required(),
      appointmentDateTime: Joi.date().iso().required(),
      appointmentType: Joi.string().valid('consultation', 'followup', 'emergency', 'procedure', 'telemedicine').required(),
      duration: Joi.number().positive().required(),
      status: Joi.string().valid('scheduled', 'confirmed', 'checked-in', 'in-progress', 'completed', 'cancelled', 'no-show').default('scheduled'),
      reasonForVisit: Joi.string().optional(),
      notes: Joi.string().optional(),
      specialInstructions: Joi.string().optional(),
      location: Joi.object({
        facilityId: Joi.string().required(),
        facilityName: Joi.string().required(),
        department: Joi.string().optional(),
        room: Joi.string().optional(),
        address: Joi.string().optional(),
      }).required(),
      scheduledDate: Joi.date().iso().default(() => new Date()),
      scheduledBy: Joi.string().required(),
      lastModified: Joi.date().iso().default(() => new Date()),
      lastModifiedBy: Joi.string().required(),
    });

    return schema.validate(data);
  }

  private validateVitalSigns(data: any): Joi.ValidationResult {
    const schema = Joi.object({
      recordId: Joi.string().required(),
      patientId: Joi.string().required(),
      encounterId: Joi.string().optional(),
      recordedDateTime: Joi.date().iso().default(() => new Date()),
      recordedBy: Joi.string().required(),
      vitalSigns: Joi.object({
        bloodPressure: Joi.object({
          systolic: Joi.number().positive().required(),
          diastolic: Joi.number().positive().required(),
          unit: Joi.string().valid('mmHg').required(),
          position: Joi.string().valid('sitting', 'standing', 'lying').optional(),
        }).optional(),
        heartRate: Joi.object({
          value: Joi.number().positive().required(),
          unit: Joi.string().valid('bpm').required(),
          rhythm: Joi.string().valid('regular', 'irregular').optional(),
        }).optional(),
        temperature: Joi.object({
          value: Joi.number().positive().required(),
          unit: Joi.string().valid('celsius', 'fahrenheit').required(),
          site: Joi.string().valid('oral', 'rectal', 'axillary', 'temporal', 'tympanic').optional(),
        }).optional(),
        respiratoryRate: Joi.object({
          value: Joi.number().positive().required(),
          unit: Joi.string().valid('breaths/min').required(),
        }).optional(),
        oxygenSaturation: Joi.object({
          value: Joi.number().min(0).max(100).required(),
          unit: Joi.string().valid('percentage').required(),
          onRoomAir: Joi.boolean().required(),
        }).optional(),
        weight: Joi.object({
          value: Joi.number().positive().required(),
          unit: Joi.string().valid('kg', 'lbs').required(),
        }).optional(),
        height: Joi.object({
          value: Joi.number().positive().required(),
          unit: Joi.string().valid('cm', 'inches').required(),
        }).optional(),
        bmi: Joi.object({
          value: Joi.number().positive().required(),
          category: Joi.string().valid('underweight', 'normal', 'overweight', 'obese').required(),
        }).optional(),
      }).required(),
      facilityId: Joi.string().required(),
      deviceInfo: Joi.object({
        deviceId: Joi.string().required(),
        deviceType: Joi.string().required(),
        manufacturer: Joi.string().optional(),
      }).optional(),
    });

    return schema.validate(data);
  }

  private validateNotification(data: any): Joi.ValidationResult {
    const schema = Joi.object({
      notificationId: Joi.string().required(),
      patientId: Joi.string().optional(),
      recipientId: Joi.string().required(),
      recipientType: Joi.string().valid('patient', 'provider', 'administrator', 'family').required(),
      type: Joi.string().valid('appointment-reminder', 'lab-results', 'medication-reminder', 'critical-alert', 'discharge-instructions', 'care-plan-update').required(),
      priority: Joi.string().valid('low', 'medium', 'high', 'urgent', 'critical').required(),
      category: Joi.string().valid('clinical', 'administrative', 'emergency', 'preventive').required(),
      title: Joi.string().required(),
      message: Joi.string().required(),
      scheduledFor: Joi.date().iso().optional(),
      expiresAt: Joi.date().iso().optional(),
      channels: Joi.array().items(Joi.string().valid('email', 'sms', 'push', 'portal', 'phone')).required(),
      deliveryAttempts: Joi.number().min(0).default(0),
      deliveryStatus: Joi.string().valid('pending', 'sent', 'delivered', 'failed', 'expired').default('pending'),
      createdDate: Joi.date().iso().default(() => new Date()),
      createdBy: Joi.string().required(),
      facilityId: Joi.string().required(),
    });

    return schema.validate(data);
  }

  private validateLabResults(data: any): Joi.ValidationResult {
    const schema = Joi.object({
      resultId: Joi.string().required(),
      patientId: Joi.string().required(),
      orderId: Joi.string().required(),
      specimenId: Joi.string().optional(),
      orderingProviderId: Joi.string().required(),
      performingLabId: Joi.string().required(),
      labName: Joi.string().required(),
      orderDateTime: Joi.date().iso().required(),
      collectionDateTime: Joi.date().iso().required(),
      receivedDateTime: Joi.date().iso().optional(),
      resultDateTime: Joi.date().iso().required(),
      reportedDateTime: Joi.date().iso().optional(),
      tests: Joi.array().items(
        Joi.object({
          testId: Joi.string().required(),
          testName: Joi.string().required(),
          testCode: Joi.string().required(),
          result: Joi.string().required(),
          unit: Joi.string().optional(),
          referenceRange: Joi.string().optional(),
          status: Joi.string().valid('normal', 'abnormal', 'critical', 'pending', 'cancelled').required(),
          flags: Joi.array().items(Joi.string().valid('high', 'low', 'critical', 'abnormal')).optional(),
          notes: Joi.string().optional(),
          methodology: Joi.string().optional(),
        }),
      ).required(),
      overallStatus: Joi.string().valid('preliminary', 'final', 'corrected', 'amended', 'cancelled').required(),
      clinicalSignificance: Joi.string().valid('normal', 'abnormal', 'critical').optional(),
      interpretation: Joi.string().optional(),
      facilityId: Joi.string().required(),
    });

    return schema.validate(data);
  }

  private validateMedication(data: any): Joi.ValidationResult {
    const schema = Joi.object({
      medicationId: Joi.string().required(),
      patientId: Joi.string().required(),
      prescriptionId: Joi.string().optional(),
      orderSetId: Joi.string().optional(),
      prescriberId: Joi.string().required(),
      prescriptionDate: Joi.date().iso().default(() => new Date()),
      medication: Joi.object({
        name: Joi.string().required(),
        genericName: Joi.string().optional(),
        brandName: Joi.string().optional(),
        ndc: Joi.string().optional(),
        rxcui: Joi.string().optional(),
        strength: Joi.string().required(),
        form: Joi.string().valid('tablet', 'capsule', 'liquid', 'injection', 'cream', 'inhaler', 'patch', 'other').required(),
      }).required(),
      dosing: Joi.object({
        dosage: Joi.string().required(),
        frequency: Joi.string().required(),
        route: Joi.string().valid('oral', 'injection', 'topical', 'inhalation', 'rectal', 'sublingual', 'other').required(),
        duration: Joi.string().optional(),
        instructions: Joi.string().required(),
        specialInstructions: Joi.string().optional(),
      }).required(),
      quantity: Joi.number().positive().required(),
      refillsRemaining: Joi.number().min(0).required(),
      totalRefills: Joi.number().min(0).required(),
      daysSupply: Joi.number().positive().required(),
      indication: Joi.string().optional(),
      status: Joi.string().valid('active', 'completed', 'discontinued', 'on-hold', 'cancelled', 'suspended').default('active'),
      startDate: Joi.date().iso().default(() => new Date()),
      endDate: Joi.date().iso().optional(),
      facilityId: Joi.string().required(),
      enteredBy: Joi.string().required(),
      lastModified: Joi.date().iso().default(() => new Date()),
      lastModifiedBy: Joi.string().required(),
    });

    return schema.validate(data);
  }
}