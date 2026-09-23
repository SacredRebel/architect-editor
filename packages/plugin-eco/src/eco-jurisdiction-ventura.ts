/**
 * Ventura County, CA — construction jurisdiction profile for Eco H3.
 * Kept in-repo (no network fetch). Sources listed on `climate.sources`.
 */

export const VENTURA_COUNTY_JURISDICTION = {
  id: 'US-CA-VENTURA',
  name: 'Ventura County, California (unincorporated / VCBC)',
  residentialCode:
    '2025 California Residential Code (CRC), Title 24 Part 2.5 (2024 IRC base), as adopted by the 2025 Ventura County Building Code (VCBC Ordinance 4655)',
  codeEffective: '2026-01-01 through 2026-12-31 (permits under 2025 VCBC)',
  electricalCode: '2025 California Electrical Code (2023 NEC base)',
  wuiCode:
    '2025 California Wildland-Urban Interface Code (CWUIC) + Ventura County Fire Protection District Hazardous Fire Area / VCWUIC amendments',
  /**
   * Typical unincorporated Ventura County residential (RE/AE) yards used for
   * the translucent buildable envelope (H16.5). Confirm with AHJ — no Turkish zoning ratios.
   */
  envelope: {
    /** Front yard setback (m) — ~20 ft common RE front. */
    frontSetbackM: 6.1,
    /** Side yard setback (m) — ~5 ft. */
    sideSetbackM: 1.52,
    /** Rear yard setback (m) — ~15 ft. */
    rearSetbackM: 4.57,
    /** Max building height (m) — ~35 ft wall/ceiling top, excludes roof. */
    maxHeightM: 10.67,
    /** Default front edge index on the parcel polygon (user can override). */
    frontEdgeIndex: 0,
    sources: [
      'Ventura County Zoning Ordinance — typical RE/AE residential yards (confirm AHJ)',
    ],
  },
  climate: {
    frostLineIn: 0,
    frostLineNote:
      'Coastal Ventura: no meaningful frost penetration. CRC/VCBC still require minimum footing embedment of 12 in below undisturbed grade (R403) — that is an embedment floor, not a frost depth.',
    footingEmbedmentMinIn: 12,
    groundSnowLoadPsf: 0,
    snowNote:
      'Coastal plain / valley floor: ground snow load treated as 0 psf for this profile (not Sierra case-study). Confirm Table R301.2(1) with AHJ for mountain sites.',
    ultimateWindMph: 100,
    windNote:
      'State-typical ASCE 7 Risk Category II ~95–110 mph; Santa Ana / canyon corridors are special wind regions — verify site. Bones CA dataset uses 100 mph statewide typical.',
    seismicSdc: 'D',
    seismicNote:
      'High seismic — SDC D typical for Ventura County population centers; sites nearer mapped faults can be E. VCBC adds hillside seismic provisions for slopes steeper than 1:3. Seismic hold-downs and tight sill anchorage expected.',
    seismicHoldDowns: true,
    anchorBoltSpacingFt: 4,
    hurricaneTies: false,
    wui: true,
    wuiNote:
      'Wildland-urban interface: Ventura County designates Hazardous Fire Areas as WUI; ignition-resistant construction (CRC Chapter 7A / CWUIC) and ≥100 ft defensible space (PRC 4291 / VCFD Standard 515) apply where mapped. This profile assumes a WUI / HFA site for Eco Village Sulphur Mountain context.',
    sources: [
      'pascalorg/plugin-bones data/jurisdictions-climate.json CA row + docs/research/climate-params.md',
      'pascalorg/plugin-bones data/jurisdictions-adoption.json CA row (2025 CRC)',
      '2025 Ventura County Building Code Ordinance 4655 (rmadocs.venturacounty.gov)',
      'Ventura County RMA Building Code FAQ — Hazardous Fire Areas / local amendments',
      'VCFPD Ord. 34 / Admin Ruling 26-803 — WUI / defensible space',
    ],
  },
} as const

export type EcoJurisdictionProfile = typeof VENTURA_COUNTY_JURISDICTION
