// AL-FARHAIN AMC AMBULANCE - PRICING & FARE CALCULATION SERVICE
// Single source of truth for transport fare, quotation, and invoice calculations.
// Adheres strictly to the approved operational transport pricing rule.

import { BASE_SETTINGS, TRIP_TYPES, ADDITIONAL_EQUIPMENTS } from '../data/pricingData.js';

/**
 * Calculates transport fare based on chargeable road distance.
 * 
 * APPROVED TRANSPORT RULE:
 * - RM 250.00 for the first 1 to 25 chargeable KM (or tripType.baseFare if customized).
 * - Additional RM 3.00 for each kilometre exceeding 25 KM.
 * - No diesel surcharge.
 * - Full floating-point precision is maintained internally; rounding is applied only
 *   at the final currency formatting step (standard 2 decimal places).
 * 
 * VERIFIED TEST CASES:
 * - 25.0 km  => RM 250.00
 * - 26.3 km  => RM 253.90 (250 + (1.3 * 3.00))
 * 
 * @param {number} chargeableKm - Exact road distance in KM
 * @param {Object} [tripType] - Optional trip type object (defaults to standard RM 250.00)
 * @returns {Object} Structured fare breakdown with internal precision and formatted amounts
 */
export function calculateTransportFare(chargeableKm, tripType = null) {
  const baseKm = BASE_SETTINGS.standardBaseKm || 25.0; // 25.0 km
  const baseFare = Number(tripType?.baseFare) || BASE_SETTINGS.basePriceNormal || 250.00;
  const extraKmRate = BASE_SETTINGS.extraKmRateNormal || 3.00; // RM 3.00 / KM

  const rawKm = typeof chargeableKm === 'number' && !isNaN(chargeableKm) && chargeableKm >= 0
    ? chargeableKm
    : 0;

  const rawExtraKm = Math.max(0, rawKm - baseKm);
  const rawExtraFee = rawExtraKm * extraKmRate;
  const rawTransportTotal = baseFare + rawExtraFee;

  // Documented Rounding Policy:
  // - Extra KM is presented to 1 decimal place.
  // - Monetary values are rounded to 2 decimal places (standard MYR cents).
  const roundedExtraKm = Math.round(rawExtraKm * 10) / 10;
  const roundedExtraFee = Math.round(rawExtraFee * 100) / 100;
  const roundedTransportTotal = Math.round(rawTransportTotal * 100) / 100;

  return {
    chargeableKm: rawKm,
    baseKm,
    baseFare,
    extraKm: roundedExtraKm,
    rawExtraKm,
    extraKmRate,
    extraDistanceFee: roundedExtraFee,
    rawExtraFee,
    totalTransportFare: roundedTransportTotal,
    rawTransportTotal,
    formulaText: rawExtraKm > 0
      ? `RM${baseFare.toFixed(0)} + (${roundedExtraKm.toFixed(1)} km × RM${extraKmRate.toFixed(0)})`
      : `RM${baseFare.toFixed(0)} (Kadar Asas ≤ 25 KM)`
  };
}

/**
 * Calculates complete booking grand total (Transport + Medical Crew + Equipment Add-ons).
 * 
 * @param {Object} params
 * @param {number} params.distanceKm - Confirmed road distance in KM
 * @param {Object} [params.tripType] - Selected trip category
 * @param {Object} [params.assistancePackage] - Selected medical staff package
 * @param {Object} [params.equipmentQuantities] - Map of equipment ID to quantity
 * @param {boolean} [params.isEventStandby=false] - Event standby package flag
 * @param {number} [params.standbyHours=4] - Duration in hours for event standby
 * @returns {Object} Comprehensive quotation breakdown
 */
export function calculateBookingQuotation({
  distanceKm,
  tripType = null,
  assistancePackage = null,
  equipmentQuantities = {},
  isEventStandby = false,
  standbyHours = 4
}) {
  let transport = null;
  let baseStep1Total = 0;

  if (isEventStandby) {
    const hours = parseInt(standbyHours, 10) || 4;
    const standbyRates = { 4: 450.00, 8: 800.00, 12: 1150.00, 24: 2000.00 };
    const standbyBase = standbyRates[hours] || (hours * 110.00);
    baseStep1Total = standbyBase;
    transport = {
      chargeableKm: 0,
      baseKm: 0,
      baseFare: standbyBase,
      extraKm: 0,
      extraKmRate: 0,
      extraDistanceFee: 0,
      totalTransportFare: standbyBase,
      formulaText: `Standby ${hours} Jam (Ambulans + Krew EMT)`
    };
  } else {
    transport = calculateTransportFare(distanceKm, tripType);
    baseStep1Total = transport.totalTransportFare;
  }

  // Staff assistance fee
  const staffFee = Number(assistancePackage?.price) || 0.00;

  // Equipment fee
  let equipmentTotal = 0;
  const equipmentItems = [];

  ADDITIONAL_EQUIPMENTS.forEach(eq => {
    const qty = equipmentQuantities[eq.id] || 0;
    if (qty > 0) {
      const itemSubtotal = qty * eq.price;
      equipmentTotal += itemSubtotal;
      equipmentItems.push({
        id: eq.id,
        name: eq.name,
        price: eq.price,
        quantity: qty,
        subtotal: itemSubtotal
      });
    }
  });

  const grandTotal = Math.round((baseStep1Total + staffFee + equipmentTotal) * 100) / 100;

  return {
    transport,
    staffFee,
    equipmentTotal,
    equipmentItems,
    grandTotal
  };
}

