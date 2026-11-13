import countries from 'i18n-iso-countries';
import frLocale from 'i18n-iso-countries/langs/fr.json';

countries.registerLocale(frLocale);

export const DEFAULT_NATIONALITY = 'TN';

const PRIORITY_CODES = ['TN', 'DZ', 'LY', 'MA', 'MR', 'EG', 'FR', 'IT', 'DE'];

interface CountryEntry {
  code: string;
  name: string;
}

let cachedList: CountryEntry[] | null = null;

export function getCountryList(): CountryEntry[] {
  if (cachedList) return cachedList;

  const allNames = countries.getNames('fr', { select: 'official' });
  const allEntries: CountryEntry[] = Object.entries(allNames).map(([code, name]) => ({
    code,
    name: typeof name === 'string' ? name : String(name),
  }));

  const prioritySet = new Set(PRIORITY_CODES);
  const priorityEntries = PRIORITY_CODES
    .map((code) => allEntries.find((e) => e.code === code))
    .filter(Boolean) as CountryEntry[];

  const remaining = allEntries
    .filter((e) => !prioritySet.has(e.code))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  cachedList = [...priorityEntries, ...remaining];
  return cachedList;
}
