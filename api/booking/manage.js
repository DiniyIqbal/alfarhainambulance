// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - BOOKING MANAGEMENT API
// Endpoint: POST /api/booking/manage
// Enforces server-side validation, RBAC, conflict checks, and concurrency.
// =========================================================================

import {
  createPatientBooking,
  approveBookingRequest,
  rejectBookingRequest,
  assignBookingResources,
  updateTripProgress,
  customerCancelOrRequestBooking,
  customerRequestReschedule,
  calculateAdminDashboardKpis,
  filterBookingsList,
  getInAppNotifications
} from '../../src/services/bookingManagementService.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Kaedah HTTP tidak dibenarkan. Sila gunakan POST.'
    });
  }

  const { action, payload } = req.body || {};

  if (!action) {
    return res.status(400).json({ success: false, error: 'Tindakan (action) tidak dinyatakan.' });
  }

  try {
    switch (action) {
      case 'SUBMIT_BOOKING': {
        const result = await createPatientBooking(payload.bookingInput, payload.allBookings || []);
        return res.status(result.success ? 200 : 400).json(result);
      }

      case 'APPROVE_BOOKING': {
        const result = await approveBookingRequest({
          booking: payload.booking,
          adminUser: payload.adminUser,
          expectedVersion: payload.expectedVersion
        });
        return res.status(result.success ? 200 : 400).json(result);
      }

      case 'REJECT_BOOKING': {
        const result = await rejectBookingRequest({
          booking: payload.booking,
          reason: payload.reason,
          adminUser: payload.adminUser,
          expectedVersion: payload.expectedVersion
        });
        return res.status(result.success ? 200 : 400).json(result);
      }

      case 'ASSIGN_RESOURCES': {
        const result = await assignBookingResources({
          booking: payload.booking,
          provider: payload.provider,
          vehicle: payload.vehicle,
          driver: payload.driver,
          crew: payload.crew,
          reassignmentReason: payload.reassignmentReason,
          adminUser: payload.adminUser,
          allBookings: payload.allBookings || []
        });
        return res.status(result.success ? 200 : 400).json(result);
      }

      case 'UPDATE_TRIP_PROGRESS': {
        const result = await updateTripProgress({
          booking: payload.booking,
          nextTripStatus: payload.nextTripStatus,
          actor: payload.actor,
          notes: payload.notes,
          hasReturnTrip: payload.hasReturnTrip,
          returnCompleted: payload.returnCompleted
        });
        return res.status(result.success ? 200 : 400).json(result);
      }

      case 'CUSTOMER_CANCEL': {
        const result = await customerCancelOrRequestBooking({
          booking: payload.booking,
          reason: payload.reason,
          customerEmail: payload.customerEmail
        });
        return res.status(result.success ? 200 : 400).json(result);
      }

      case 'CUSTOMER_RESCHEDULE': {
        const result = await customerRequestReschedule({
          booking: payload.booking,
          newTime: payload.newTime,
          reason: payload.reason,
          customerEmail: payload.customerEmail
        });
        return res.status(result.success ? 200 : 400).json(result);
      }

      case 'GET_KPIS': {
        const kpis = calculateAdminDashboardKpis(payload.bookings || [], payload.branchFilter || 'all');
        return res.status(200).json({ success: true, kpis });
      }

      case 'FILTER_BOOKINGS': {
        const list = filterBookingsList(payload.bookings || [], payload.options || {});
        return res.status(200).json({ success: true, bookings: list });
      }

      case 'GET_NOTIFICATIONS': {
        const notifs = getInAppNotifications(payload || {});
        return res.status(200).json({ success: true, notifications: notifs });
      }

      default:
        return res.status(400).json({ success: false, error: `Tindakan tidak dikenali: ${action}` });
    }
  } catch (err) {
    console.error(`[API /api/booking/manage] Error executing ${action}:`, err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Ralat dalaman pelayan pemprosesan tempahan.'
    });
  }
}

