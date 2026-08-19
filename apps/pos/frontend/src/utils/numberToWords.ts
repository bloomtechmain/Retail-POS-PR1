const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

// Currency names for the "amount in words" line — falls back to the raw
// currency code for anything not in this list (any-business/any-currency
// philosophy, same as the rest of the app's currency handling).
const CURRENCY_NAMES: Record<string, { major: string; minor: string }> = {
  USD: { major: 'Dollars', minor: 'Cents' },
  LKR: { major: 'Rupees', minor: 'Cents' },
  INR: { major: 'Rupees', minor: 'Paise' },
  EUR: { major: 'Euros', minor: 'Cents' },
  GBP: { major: 'Pounds', minor: 'Pence' },
  AUD: { major: 'Dollars', minor: 'Cents' },
};

function threeDigitsToWords(n: number): string {
  let s = '';
  if (n >= 100) {
    s += `${ONES[Math.floor(n / 100)]} Hundred`;
    n %= 100;
    if (n > 0) s += ' ';
  }
  if (n >= 20) {
    s += TENS[Math.floor(n / 10)];
    if (n % 10 > 0) s += ` ${ONES[n % 10]}`;
  } else if (n > 0) {
    s += ONES[n];
  }
  return s;
}

// Converts a non-negative integer into English words using the short scale
// (Thousand / Million / Billion) grouping.
function integerToWords(value: number): string {
  if (value === 0) return 'Zero';
  const groups = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];
  const parts: string[] = [];
  let n = Math.floor(value);
  let groupIndex = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk > 0) {
      const words = threeDigitsToWords(chunk) + (groups[groupIndex] ? ` ${groups[groupIndex]}` : '');
      parts.unshift(words);
    }
    n = Math.floor(n / 1000);
    groupIndex++;
  }
  return parts.join(' ');
}

// e.g. amountToWords(47200, 'LKR') -> "Forty Seven Thousand Two Hundred Rupees Only"
// e.g. amountToWords(47200.50, 'LKR') -> "Forty Seven Thousand Two Hundred Rupees and Fifty Cents Only"
export function amountToWords(amount: number, currencyCode?: string): string {
  const names = (currencyCode && CURRENCY_NAMES[currencyCode]) || { major: currencyCode || 'Units', minor: 'Cents' };
  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);

  let result = `${integerToWords(whole)} ${names.major}`;
  if (cents > 0) {
    result += ` and ${integerToWords(cents)} ${names.minor}`;
  }
  return `${result} Only`;
}
