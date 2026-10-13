/**
 * Indian GST reference data: the state/UT code list and the GSTIN format pattern.
 * Pure constants; no API calls. Used by BuyerForm and settings/CompanyPanel to pick a state and validate a
 * GSTIN before saving. SRS: BR-06 (state code decides CGST+SGST vs IGST).
 */

/**
 * GST state / UT codes, ordered by code. Used by dropdowns in BuyerForm (domestic buyers) and the Company
 * settings: choosing a state fills BOTH the name and the 2-digit code, and the code is what the API
 * compares with the company's code to choose CGST+SGST (same state) or IGST (different state) (BR-06).
 * Codes 25 and 28 are absent because those old states no longer exist (merged / split).
 */
export const INDIAN_STATES: { name: string; code: string }[] = [
  ['Jammu & Kashmir', '01'], ['Himachal Pradesh', '02'], ['Punjab', '03'], ['Chandigarh', '04'], ['Uttarakhand', '05'],
  ['Haryana', '06'], ['Delhi', '07'], ['Rajasthan', '08'], ['Uttar Pradesh', '09'], ['Bihar', '10'], ['Sikkim', '11'],
  ['Arunachal Pradesh', '12'], ['Nagaland', '13'], ['Manipur', '14'], ['Mizoram', '15'], ['Tripura', '16'], ['Meghalaya', '17'],
  ['Assam', '18'], ['West Bengal', '19'], ['Jharkhand', '20'], ['Odisha', '21'], ['Chhattisgarh', '22'], ['Madhya Pradesh', '23'],
  ['Gujarat', '24'], ['Dadra & Nagar Haveli and Daman & Diu', '26'], ['Maharashtra', '27'], ['Karnataka', '29'], ['Goa', '30'],
  ['Lakshadweep', '31'], ['Kerala', '32'], ['Tamil Nadu', '33'], ['Puducherry', '34'], ['Andaman & Nicobar Islands', '35'],
  ['Telangana', '36'], ['Andhra Pradesh', '37'], ['Ladakh', '38'],
].map(([name, code]) => ({ name: name!, code: code! }));

/**
 * Format check for a 15-character GSTIN: 2-digit state code, 5-letter + 4-digit + 1-letter PAN, an entity
 * number (1-9 or A-Z), a literal 'Z', and a check character. Only the shape is checked, not the checksum.
 * It is the same pattern as in api/src/schemas.ts, which re-validates on the server. Callers upper-case the
 * text before testing.
 */
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
