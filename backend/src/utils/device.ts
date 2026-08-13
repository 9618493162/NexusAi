export interface DeviceInfo {
  browser: string;
  os: string;
  device: string;
}

/**
 * Minimal, dependency-free User-Agent parser for the sessions list. Good
 * enough for a friendly "Chrome on Windows" label — not a full ua-parser.
 */
export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  if (!ua) return { browser: "Unknown", os: "Unknown", device: "Unknown" };
  const u = ua.toLowerCase();

  let device = "Desktop";
  if (/iphone/.test(u)) device = "iPhone";
  else if (/ipad/.test(u)) device = "iPad";
  else if (/android/.test(u)) device = "Android";
  else if (/mobile/.test(u)) device = "Mobile";

  let os = "Unknown";
  if (/windows nt 10/.test(u)) os = "Windows 10/11";
  else if (/windows nt 6\.3/.test(u)) os = "Windows 8.1";
  else if (/windows nt 6\.[01]/.test(u)) os = "Windows 7";
  else if (/windows phone/.test(u)) os = "Windows Phone";
  // iOS before macOS: iPhone UAs contain "like Mac OS X" — must match iOS first.
  else if (/iphone os|ipad os|ios/.test(u)) os = "iOS";
  else if (/mac os x 10_15|mac os x 1[1-5]/.test(u)) os = "macOS";
  else if (/mac os x/.test(u)) os = "macOS";
  else if (/android/.test(u)) os = "Android";
  else if (/linux/.test(u)) os = "Linux";
  else if (/cros/.test(u)) os = "ChromeOS";

  let browser = "Unknown";
  if (/edg\//.test(u)) browser = "Edge";
  else if (/opr\/|opera/.test(u)) browser = "Opera";
  else if (/chrome\//.test(u) && !/chromium/.test(u)) browser = "Chrome";
  else if (/chromium/.test(u)) browser = "Chromium";
  else if (/firefox\//.test(u)) browser = "Firefox";
  else if (/safari\//.test(u) && !/chrome/.test(u)) browser = "Safari";

  return { browser, os, device };
}
