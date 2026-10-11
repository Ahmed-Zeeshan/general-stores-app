/** Amount in words the Pakistani way (lakh, crore), e.g. 145000 → "One Lakh Forty-Five Thousand Rupees Only". */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function upTo99(n: number) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}
function upTo999(n: number) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? upTo99(rest) : ""].filter(Boolean).join(" ");
}

export function rupeesInWords(amount: number) {
  let n = Math.floor(Math.abs(amount));
  const paisa = Math.round((Math.abs(amount) - n) * 100);
  if (n === 0 && paisa === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${crore > 999 ? rupeesInWords(crore).replace(/ Rupees Only$/, "") : upTo999(crore)} Crore`);
  if (lakh) parts.push(`${upTo99(lakh)} Lakh`);
  if (thousand) parts.push(`${upTo99(thousand)} Thousand`);
  if (n) parts.push(upTo999(n));
  const rupees = parts.join(" ");
  return `${rupees ? `${rupees} Rupees` : ""}${paisa ? `${rupees ? " and " : ""}${upTo99(paisa)} Paisa` : ""} Only`;
}
