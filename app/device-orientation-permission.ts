export type DeviceOrientationPermissionState =
  | "granted"
  | "denied"
  | "unsupported";

export type DeviceOrientationPermissionRequester = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export async function requestDeviceOrientationPermission(
  requester: DeviceOrientationPermissionRequester | null,
): Promise<DeviceOrientationPermissionState> {
  if (!requester) return "unsupported";
  if (typeof requester.requestPermission !== "function") return "granted";

  try {
    return (await requester.requestPermission()) === "granted"
      ? "granted"
      : "denied";
  } catch {
    return "denied";
  }
}
