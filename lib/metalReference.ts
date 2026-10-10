// Static metal reference prices (INR per gram), mirroring
// api/core/metal_prices.py. The metals.dev free tier is exhausted, so the
// UI renders this reviewed snapshot instead of a live feed.

export const METAL_REFERENCE_DATE = "Aug 2026";

export const METAL_REFERENCE_INR_PER_G: Record<string, number> = {
  gold: 13044,
  silver: 155,
  copper: 0.95,
  aluminum: 0.28,
};
