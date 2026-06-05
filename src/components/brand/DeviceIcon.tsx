/**
 * DeviceIcon — clean line icon for a device id in the "Shop by device" menu
 * and homepage rail. Replaces emoji for a more professional, consistent look.
 */
import {
  Smartphone,
  Headphones,
  Laptop,
  Watch,
  Tablet,
  BookOpen,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

const DEVICE_ICONS: Record<string, LucideIcon> = {
  iphone: Smartphone,
  galaxy: Smartphone,
  pixel: Smartphone,
  airpods: Headphones,
  macbook: Laptop,
  "apple-watch": Watch,
  ipad: Tablet,
  "apple-accessories": Sparkles,
  kindle: BookOpen,
};

export function DeviceIcon({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const Icon = DEVICE_ICONS[id] ?? Smartphone;
  return <Icon className={className} aria-hidden />;
}
