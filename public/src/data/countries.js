// public/src/data/countries.js
//
// Country data for phone-number country pickers and similar UI.
//
// Source: UN member states (193 countries) plus 2 observer states (Vatican, Palestine),
//     
// Sorted alphabetically by English name.
//
// Shape: { name, iso, dialCode, flag }
//   name      — display name in English
//   iso       — ISO 3166-1 alpha-2 code (uppercase)
//   dialCode  — E.164 country calling code with leading "+"
//   flag      — emoji flag (regional indicator pair)
//
// Storage convention: settings only store the dialCode string (e.g. "+961").
// Display code looks up the rest from this file via getCountryByDialCode().
//
// To find a country by dial code, use getCountryByDialCode("+961").
// To find by ISO code, use getCountryByIso("LB").

export const countries = [
  { name: "Afghanistan", iso: "AF", dialCode: "+93", flag: "🇦🇫" },
  { name: "Albania", iso: "AL", dialCode: "+355", flag: "🇦🇱" },
  { name: "Algeria", iso: "DZ", dialCode: "+213", flag: "🇩🇿" },
  { name: "Andorra", iso: "AD", dialCode: "+376", flag: "🇦🇩" },
  { name: "Angola", iso: "AO", dialCode: "+244", flag: "🇦🇴" },
  { name: "Antigua and Barbuda", iso: "AG", dialCode: "+1268", flag: "🇦🇬" },
  { name: "Argentina", iso: "AR", dialCode: "+54", flag: "🇦🇷" },
  { name: "Armenia", iso: "AM", dialCode: "+374", flag: "🇦🇲" },
  { name: "Australia", iso: "AU", dialCode: "+61", flag: "🇦🇺" },
  { name: "Austria", iso: "AT", dialCode: "+43", flag: "🇦🇹" },
  { name: "Azerbaijan", iso: "AZ", dialCode: "+994", flag: "🇦🇿" },
  { name: "Bahamas", iso: "BS", dialCode: "+1242", flag: "🇧🇸" },
  { name: "Bahrain", iso: "BH", dialCode: "+973", flag: "🇧🇭" },
  { name: "Bangladesh", iso: "BD", dialCode: "+880", flag: "🇧🇩" },
  { name: "Barbados", iso: "BB", dialCode: "+1246", flag: "🇧🇧" },
  { name: "Belarus", iso: "BY", dialCode: "+375", flag: "🇧🇾" },
  { name: "Belgium", iso: "BE", dialCode: "+32", flag: "🇧🇪" },
  { name: "Belize", iso: "BZ", dialCode: "+501", flag: "🇧🇿" },
  { name: "Benin", iso: "BJ", dialCode: "+229", flag: "🇧🇯" },
  { name: "Bhutan", iso: "BT", dialCode: "+975", flag: "🇧🇹" },
  { name: "Bolivia", iso: "BO", dialCode: "+591", flag: "🇧🇴" },
  { name: "Bosnia and Herzegovina", iso: "BA", dialCode: "+387", flag: "🇧🇦" },
  { name: "Botswana", iso: "BW", dialCode: "+267", flag: "🇧🇼" },
  { name: "Brazil", iso: "BR", dialCode: "+55", flag: "🇧🇷" },
  { name: "Brunei", iso: "BN", dialCode: "+673", flag: "🇧🇳" },
  { name: "Bulgaria", iso: "BG", dialCode: "+359", flag: "🇧🇬" },
  { name: "Burkina Faso", iso: "BF", dialCode: "+226", flag: "🇧🇫" },
  { name: "Burundi", iso: "BI", dialCode: "+257", flag: "🇧🇮" },
  { name: "Cabo Verde", iso: "CV", dialCode: "+238", flag: "🇨🇻" },
  { name: "Cambodia", iso: "KH", dialCode: "+855", flag: "🇰🇭" },
  { name: "Cameroon", iso: "CM", dialCode: "+237", flag: "🇨🇲" },
  { name: "Canada", iso: "CA", dialCode: "+1", flag: "🇨🇦" },
  { name: "Central African Republic", iso: "CF", dialCode: "+236", flag: "🇨🇫" },
  { name: "Chad", iso: "TD", dialCode: "+235", flag: "🇹🇩" },
  { name: "Chile", iso: "CL", dialCode: "+56", flag: "🇨🇱" },
  { name: "China", iso: "CN", dialCode: "+86", flag: "🇨🇳" },
  { name: "Colombia", iso: "CO", dialCode: "+57", flag: "🇨🇴" },
  { name: "Comoros", iso: "KM", dialCode: "+269", flag: "🇰🇲" },
  { name: "Congo", iso: "CG", dialCode: "+242", flag: "🇨🇬" },
  { name: "Costa Rica", iso: "CR", dialCode: "+506", flag: "🇨🇷" },
  { name: "Côte d'Ivoire", iso: "CI", dialCode: "+225", flag: "🇨🇮" },
  { name: "Croatia", iso: "HR", dialCode: "+385", flag: "🇭🇷" },
  { name: "Cuba", iso: "CU", dialCode: "+53", flag: "🇨🇺" },
  { name: "Cyprus", iso: "CY", dialCode: "+357", flag: "🇨🇾" },
  { name: "Czechia", iso: "CZ", dialCode: "+420", flag: "🇨🇿" },
  { name: "Democratic Republic of the Congo", iso: "CD", dialCode: "+243", flag: "🇨🇩" },
  { name: "Denmark", iso: "DK", dialCode: "+45", flag: "🇩🇰" },
  { name: "Djibouti", iso: "DJ", dialCode: "+253", flag: "🇩🇯" },
  { name: "Dominica", iso: "DM", dialCode: "+1767", flag: "🇩🇲" },
  { name: "Dominican Republic", iso: "DO", dialCode: "+1809", flag: "🇩🇴" },
  { name: "Ecuador", iso: "EC", dialCode: "+593", flag: "🇪🇨" },
  { name: "Egypt", iso: "EG", dialCode: "+20", flag: "🇪🇬" },
  { name: "El Salvador", iso: "SV", dialCode: "+503", flag: "🇸🇻" },
  { name: "Equatorial Guinea", iso: "GQ", dialCode: "+240", flag: "🇬🇶" },
  { name: "Eritrea", iso: "ER", dialCode: "+291", flag: "🇪🇷" },
  { name: "Estonia", iso: "EE", dialCode: "+372", flag: "🇪🇪" },
  { name: "Eswatini", iso: "SZ", dialCode: "+268", flag: "🇸🇿" },
  { name: "Ethiopia", iso: "ET", dialCode: "+251", flag: "🇪🇹" },
  { name: "Fiji", iso: "FJ", dialCode: "+679", flag: "🇫🇯" },
  { name: "Finland", iso: "FI", dialCode: "+358", flag: "🇫🇮" },
  { name: "France", iso: "FR", dialCode: "+33", flag: "🇫🇷" },
  { name: "Gabon", iso: "GA", dialCode: "+241", flag: "🇬🇦" },
  { name: "Gambia", iso: "GM", dialCode: "+220", flag: "🇬🇲" },
  { name: "Georgia", iso: "GE", dialCode: "+995", flag: "🇬🇪" },
  { name: "Germany", iso: "DE", dialCode: "+49", flag: "🇩🇪" },
  { name: "Ghana", iso: "GH", dialCode: "+233", flag: "🇬🇭" },
  { name: "Greece", iso: "GR", dialCode: "+30", flag: "🇬🇷" },
  { name: "Grenada", iso: "GD", dialCode: "+1473", flag: "🇬🇩" },
  { name: "Guatemala", iso: "GT", dialCode: "+502", flag: "🇬🇹" },
  { name: "Guinea", iso: "GN", dialCode: "+224", flag: "🇬🇳" },
  { name: "Guinea-Bissau", iso: "GW", dialCode: "+245", flag: "🇬🇼" },
  { name: "Guyana", iso: "GY", dialCode: "+592", flag: "🇬🇾" },
  { name: "Haiti", iso: "HT", dialCode: "+509", flag: "🇭🇹" },
  { name: "Honduras", iso: "HN", dialCode: "+504", flag: "🇭🇳" },
  { name: "Hungary", iso: "HU", dialCode: "+36", flag: "🇭🇺" },
  { name: "Iceland", iso: "IS", dialCode: "+354", flag: "🇮🇸" },
  { name: "India", iso: "IN", dialCode: "+91", flag: "🇮🇳" },
  { name: "Indonesia", iso: "ID", dialCode: "+62", flag: "🇮🇩" },
  { name: "Iran", iso: "IR", dialCode: "+98", flag: "🇮🇷" },
  { name: "Iraq", iso: "IQ", dialCode: "+964", flag: "🇮🇶" },
  { name: "Ireland", iso: "IE", dialCode: "+353", flag: "🇮🇪" },
  { name: "Italy", iso: "IT", dialCode: "+39", flag: "🇮🇹" },
  { name: "Jamaica", iso: "JM", dialCode: "+1876", flag: "🇯🇲" },
  { name: "Japan", iso: "JP", dialCode: "+81", flag: "🇯🇵" },
  { name: "Jordan", iso: "JO", dialCode: "+962", flag: "🇯🇴" },
  { name: "Kazakhstan", iso: "KZ", dialCode: "+7", flag: "🇰🇿" },
  { name: "Kenya", iso: "KE", dialCode: "+254", flag: "🇰🇪" },
  { name: "Kiribati", iso: "KI", dialCode: "+686", flag: "🇰🇮" },
  { name: "Kuwait", iso: "KW", dialCode: "+965", flag: "🇰🇼" },
  { name: "Kyrgyzstan", iso: "KG", dialCode: "+996", flag: "🇰🇬" },
  { name: "Laos", iso: "LA", dialCode: "+856", flag: "🇱🇦" },
  { name: "Latvia", iso: "LV", dialCode: "+371", flag: "🇱🇻" },
  { name: "Lebanon", iso: "LB", dialCode: "+961", flag: "🇱🇧" },
  { name: "Lesotho", iso: "LS", dialCode: "+266", flag: "🇱🇸" },
  { name: "Liberia", iso: "LR", dialCode: "+231", flag: "🇱🇷" },
  { name: "Libya", iso: "LY", dialCode: "+218", flag: "🇱🇾" },
  { name: "Liechtenstein", iso: "LI", dialCode: "+423", flag: "🇱🇮" },
  { name: "Lithuania", iso: "LT", dialCode: "+370", flag: "🇱🇹" },
  { name: "Luxembourg", iso: "LU", dialCode: "+352", flag: "🇱🇺" },
  { name: "Madagascar", iso: "MG", dialCode: "+261", flag: "🇲🇬" },
  { name: "Malawi", iso: "MW", dialCode: "+265", flag: "🇲🇼" },
  { name: "Malaysia", iso: "MY", dialCode: "+60", flag: "🇲🇾" },
  { name: "Maldives", iso: "MV", dialCode: "+960", flag: "🇲🇻" },
  { name: "Mali", iso: "ML", dialCode: "+223", flag: "🇲🇱" },
  { name: "Malta", iso: "MT", dialCode: "+356", flag: "🇲🇹" },
  { name: "Marshall Islands", iso: "MH", dialCode: "+692", flag: "🇲🇭" },
  { name: "Mauritania", iso: "MR", dialCode: "+222", flag: "🇲🇷" },
  { name: "Mauritius", iso: "MU", dialCode: "+230", flag: "🇲🇺" },
  { name: "Mexico", iso: "MX", dialCode: "+52", flag: "🇲🇽" },
  { name: "Micronesia", iso: "FM", dialCode: "+691", flag: "🇫🇲" },
  { name: "Moldova", iso: "MD", dialCode: "+373", flag: "🇲🇩" },
  { name: "Monaco", iso: "MC", dialCode: "+377", flag: "🇲🇨" },
  { name: "Mongolia", iso: "MN", dialCode: "+976", flag: "🇲🇳" },
  { name: "Montenegro", iso: "ME", dialCode: "+382", flag: "🇲🇪" },
  { name: "Morocco", iso: "MA", dialCode: "+212", flag: "🇲🇦" },
  { name: "Mozambique", iso: "MZ", dialCode: "+258", flag: "🇲🇿" },
  { name: "Myanmar", iso: "MM", dialCode: "+95", flag: "🇲🇲" },
  { name: "Namibia", iso: "NA", dialCode: "+264", flag: "🇳🇦" },
  { name: "Nauru", iso: "NR", dialCode: "+674", flag: "🇳🇷" },
  { name: "Nepal", iso: "NP", dialCode: "+977", flag: "🇳🇵" },
  { name: "Netherlands", iso: "NL", dialCode: "+31", flag: "🇳🇱" },
  { name: "New Zealand", iso: "NZ", dialCode: "+64", flag: "🇳🇿" },
  { name: "Nicaragua", iso: "NI", dialCode: "+505", flag: "🇳🇮" },
  { name: "Niger", iso: "NE", dialCode: "+227", flag: "🇳🇪" },
  { name: "Nigeria", iso: "NG", dialCode: "+234", flag: "🇳🇬" },
  { name: "North Korea", iso: "KP", dialCode: "+850", flag: "🇰🇵" },
  { name: "North Macedonia", iso: "MK", dialCode: "+389", flag: "🇲🇰" },
  { name: "Norway", iso: "NO", dialCode: "+47", flag: "🇳🇴" },
  { name: "Oman", iso: "OM", dialCode: "+968", flag: "🇴🇲" },
  { name: "Pakistan", iso: "PK", dialCode: "+92", flag: "🇵🇰" },
  { name: "Palau", iso: "PW", dialCode: "+680", flag: "🇵🇼" },
  { name: "Palestine", iso: "PS", dialCode: "+970", flag: "🇵🇸" },
  { name: "Panama", iso: "PA", dialCode: "+507", flag: "🇵🇦" },
  { name: "Papua New Guinea", iso: "PG", dialCode: "+675", flag: "🇵🇬" },
  { name: "Paraguay", iso: "PY", dialCode: "+595", flag: "🇵🇾" },
  { name: "Peru", iso: "PE", dialCode: "+51", flag: "🇵🇪" },
  { name: "Philippines", iso: "PH", dialCode: "+63", flag: "🇵🇭" },
  { name: "Poland", iso: "PL", dialCode: "+48", flag: "🇵🇱" },
  { name: "Portugal", iso: "PT", dialCode: "+351", flag: "🇵🇹" },
  { name: "Qatar", iso: "QA", dialCode: "+974", flag: "🇶🇦" },
  { name: "Romania", iso: "RO", dialCode: "+40", flag: "🇷🇴" },
  { name: "Russia", iso: "RU", dialCode: "+7", flag: "🇷🇺" },
  { name: "Rwanda", iso: "RW", dialCode: "+250", flag: "🇷🇼" },
  { name: "Saint Kitts and Nevis", iso: "KN", dialCode: "+1869", flag: "🇰🇳" },
  { name: "Saint Lucia", iso: "LC", dialCode: "+1758", flag: "🇱🇨" },
  { name: "Saint Vincent and the Grenadines", iso: "VC", dialCode: "+1784", flag: "🇻🇨" },
  { name: "Samoa", iso: "WS", dialCode: "+685", flag: "🇼🇸" },
  { name: "San Marino", iso: "SM", dialCode: "+378", flag: "🇸🇲" },
  { name: "Sao Tome and Principe", iso: "ST", dialCode: "+239", flag: "🇸🇹" },
  { name: "Saudi Arabia", iso: "SA", dialCode: "+966", flag: "🇸🇦" },
  { name: "Senegal", iso: "SN", dialCode: "+221", flag: "🇸🇳" },
  { name: "Serbia", iso: "RS", dialCode: "+381", flag: "🇷🇸" },
  { name: "Seychelles", iso: "SC", dialCode: "+248", flag: "🇸🇨" },
  { name: "Sierra Leone", iso: "SL", dialCode: "+232", flag: "🇸🇱" },
  { name: "Singapore", iso: "SG", dialCode: "+65", flag: "🇸🇬" },
  { name: "Slovakia", iso: "SK", dialCode: "+421", flag: "🇸🇰" },
  { name: "Slovenia", iso: "SI", dialCode: "+386", flag: "🇸🇮" },
  { name: "Solomon Islands", iso: "SB", dialCode: "+677", flag: "🇸🇧" },
  { name: "Somalia", iso: "SO", dialCode: "+252", flag: "🇸🇴" },
  { name: "South Africa", iso: "ZA", dialCode: "+27", flag: "🇿🇦" },
  { name: "South Korea", iso: "KR", dialCode: "+82", flag: "🇰🇷" },
  { name: "South Sudan", iso: "SS", dialCode: "+211", flag: "🇸🇸" },
  { name: "Spain", iso: "ES", dialCode: "+34", flag: "🇪🇸" },
  { name: "Sri Lanka", iso: "LK", dialCode: "+94", flag: "🇱🇰" },
  { name: "Sudan", iso: "SD", dialCode: "+249", flag: "🇸🇩" },
  { name: "Suriname", iso: "SR", dialCode: "+597", flag: "🇸🇷" },
  { name: "Sweden", iso: "SE", dialCode: "+46", flag: "🇸🇪" },
  { name: "Switzerland", iso: "CH", dialCode: "+41", flag: "🇨🇭" },
  { name: "Syria", iso: "SY", dialCode: "+963", flag: "🇸🇾" },
  { name: "Tajikistan", iso: "TJ", dialCode: "+992", flag: "🇹🇯" },
  { name: "Tanzania", iso: "TZ", dialCode: "+255", flag: "🇹🇿" },
  { name: "Thailand", iso: "TH", dialCode: "+66", flag: "🇹🇭" },
  { name: "Timor-Leste", iso: "TL", dialCode: "+670", flag: "🇹🇱" },
  { name: "Togo", iso: "TG", dialCode: "+228", flag: "🇹🇬" },
  { name: "Tonga", iso: "TO", dialCode: "+676", flag: "🇹🇴" },
  { name: "Trinidad and Tobago", iso: "TT", dialCode: "+1868", flag: "🇹🇹" },
  { name: "Tunisia", iso: "TN", dialCode: "+216", flag: "🇹🇳" },
  { name: "Türkiye", iso: "TR", dialCode: "+90", flag: "🇹🇷" },
  { name: "Turkmenistan", iso: "TM", dialCode: "+993", flag: "🇹🇲" },
  { name: "Tuvalu", iso: "TV", dialCode: "+688", flag: "🇹🇻" },
  { name: "Uganda", iso: "UG", dialCode: "+256", flag: "🇺🇬" },
  { name: "Ukraine", iso: "UA", dialCode: "+380", flag: "🇺🇦" },
  { name: "United Arab Emirates", iso: "AE", dialCode: "+971", flag: "🇦🇪" },
  { name: "United Kingdom", iso: "GB", dialCode: "+44", flag: "🇬🇧" },
  { name: "United States", iso: "US", dialCode: "+1", flag: "🇺🇸" },
  { name: "Uruguay", iso: "UY", dialCode: "+598", flag: "🇺🇾" },
  { name: "Uzbekistan", iso: "UZ", dialCode: "+998", flag: "🇺🇿" },
  { name: "Vanuatu", iso: "VU", dialCode: "+678", flag: "🇻🇺" },
  { name: "Vatican City", iso: "VA", dialCode: "+379", flag: "🇻🇦" },
  { name: "Venezuela", iso: "VE", dialCode: "+58", flag: "🇻🇪" },
  { name: "Vietnam", iso: "VN", dialCode: "+84", flag: "🇻🇳" },
  { name: "Yemen", iso: "YE", dialCode: "+967", flag: "🇾🇪" },
  { name: "Zambia", iso: "ZM", dialCode: "+260", flag: "🇿🇲" },
  { name: "Zimbabwe", iso: "ZW", dialCode: "+227", flag: "🇿🇼" }
];

/**
 * Find a country by its dial code (e.g. "+961").
 * Returns undefined if not found.
 *
 * Note: some dial codes are shared (e.g. "+1" is US, Canada, and many Caribbean
 * islands with longer prefixes). This returns the FIRST match alphabetically,
 * which is "Canada" for "+1". For storage, prefer ISO codes when disambiguation
 * matters; this function is for display lookups where the stored value is the
 * authoritative answer.
 */
export function getCountryByDialCode(dialCode) {
  return countries.find(c => c.dialCode === dialCode);
}

/**
 * Find a country by its ISO 3166-1 alpha-2 code (e.g. "LB").
 * Returns undefined if not found.
 */
export function getCountryByIso(iso) {
  if (!iso) return undefined;
  const upper = iso.toUpperCase();
  return countries.find(c => c.iso === upper);
}

/**
 * The default country for a fresh tenant. Used as the wizard's pre-selection.
 * Lebanon — matches §5 of the master prompt.
 */
export const DEFAULT_COUNTRY_ISO = "LB";