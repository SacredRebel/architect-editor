/**
 * Ventura County parcel setbacks + height limit for Eco H16.5.
 * Canonical numbers live on `VENTURA_COUNTY_JURISDICTION.envelope`.
 */
import { VENTURA_COUNTY_JURISDICTION } from '../eco-jurisdiction-ventura'

export const VENTURA_ENVELOPE = VENTURA_COUNTY_JURISDICTION.envelope

export type VenturaEnvelope = typeof VENTURA_ENVELOPE
