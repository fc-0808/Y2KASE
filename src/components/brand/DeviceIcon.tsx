/**
 * DeviceIcon — premium glossy 3D device icon (holographic claymorphism) for the
 * "Shop by device" menu/section. Replaces flat line icons with branded art.
 * Size is controlled via `className` (e.g. "h-7 w-7"); colour is baked into the art.
 */
import Image from "next/image";

const DEVICE_FILE: Record<string, string> = {
  iphone: "phone",
  galaxy: "phone",
  pixel: "phone",
  airpods: "airpods",
  macbook: "laptop",
  "apple-watch": "watch",
  ipad: "tablet",
  kindle: "ereader",
  "apple-accessories": "charm",
};

export function DeviceIcon({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const file = DEVICE_FILE[id] ?? "phone";
  return (
    <Image
      src={`/brand/devices/${file}.webp`}
      alt=""
      aria-hidden
      width={96}
      height={96}
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
