export function isTtarawaingIOS(userAgent: string) {
  return userAgent.split(/\s+/).includes("TtarawaingApp/iOS");
}
