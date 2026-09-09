/**
 * Engagement click tracking (separate from listing views).
 *
 *   CarfoxTrack.engagement('whatsapp' | 'call' | 'message' | 'share' | 'website', { vehicleId, dealershipId })
 *
 * Fire-and-forget: never blocks the click, never throws. The server resolves the dealership
 * from the vehicle when only vehicleId is given, and ignores more than 10 events per minute
 * from one IP.
 */
(function (global) {
  'use strict';

  function engagement(type, opts) {
    opts = opts || {};
    try {
      var payload = { event_type: String(type || '') };
      if (opts.vehicleId != null) payload.vehicle_id = Number(opts.vehicleId);
      if (opts.dealershipId != null) payload.dealership_id = Number(opts.dealershipId);
      fetch('/api/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () {});
    } catch (_) {}
  }

  global.CarfoxTrack = { engagement: engagement };
})(typeof window !== 'undefined' ? window : this);
