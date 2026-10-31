import { ImageResponse } from "next/og";
import { IconArt } from "./_icon/icon-art";

// 192 and 512 are the sizes Chrome needs before it offers installation.
const SIZES = [192, 512] as const;

export function generateImageMetadata() {
  return SIZES.map((size) => ({
    id: String(size),
    size: { width: size, height: size },
    contentType: "image/png",
    alt: "Rally Stage Times",
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const size = Number(await id);
  return new ImageResponse(<IconArt size={size} />, {
    width: size,
    height: size,
  });
}
