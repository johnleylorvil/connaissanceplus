export const HAITI_DEPARTMENTS = [
  'Artibonite',
  'Centre',
  'Grand\'Anse',
  'Nippes',
  'Nord',
  'Nord-Est',
  'Nord-Ouest',
  'Ouest',
  'Sud',
  'Sud-Est',
] as const

export type HaitiDepartment = (typeof HAITI_DEPARTMENTS)[number]