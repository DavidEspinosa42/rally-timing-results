import { ImageResponse } from "next/og";
import { IconArt } from "./_icon/icon-art";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS rounds the corners itself.
export default function AppleIcon() {
  return new ImageResponse(<IconArt size={size.width} />, size);
}
