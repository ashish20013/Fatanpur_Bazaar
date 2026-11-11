import { useWindowDimensions } from 'react-native';
import { space } from '../theme/tokens';

/** The narrowest a product card may become before its own text stops fitting. */
const MIN_CARD = 150;
/** The website's breakpoints: 2 up to 768, 3 to 1023, 4 beyond (apps/web §9). */
const MAX_COLUMNS = 4;

/**
 * How many product cards fit across, measured rather than assumed.
 *
 * ⚠️ The browsing grids were hard-coded to three columns. On a 393dp phone that leaves about
 * 113dp per card — and a card has to hold a Devanagari product name, a price, a pack size, a
 * supplier and a button. Short names got away with it; the moment a category carried real names
 * ("गर्भावस्था का अल्ट्रासाउंड", supplier "हर्षित पैथोलॉजी") the name clipped mid-word, the pack
 * size and the supplier fought over one line, and the row read as broken. Health Check-up is the
 * worst of them because every item is a SERVICE with a long name and no photograph, but the
 * cause was never that category — it was the column count, shared by every grid in the app.
 *
 * Two columns on a phone is also what the website does, so the two shops look alike.
 *
 * The home screen keeps its own tighter three-up rails on purpose: those are a glance at what a
 * category holds, with the full grid one tap away, and the owner asked for three sections to be
 * visible without scrolling.
 */
export function useGridColumns(): number {
  const { width } = useWindowDimensions();
  const usable = width - space[4] * 2; // the grid's own horizontal padding
  const fit = Math.floor((usable + space[3]) / (MIN_CARD + space[3]));
  return Math.max(2, Math.min(MAX_COLUMNS, fit));
}
