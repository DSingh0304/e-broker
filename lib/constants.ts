export const CLASS_COLORS = {
  battery: "#EF4444", // red    - toxic warning
  pcb: "#3B82F6", // blue   - precious metal
  motherboard: "#22C55E", // green  - precious metal
  ram: "#A855F7", // purple - precious metal
  chip: "#F59E0B", // amber  - precious metal
  hard_drive: "#8B5CF6", // violet - bulk value
  copper_cable: "#F97316", // orange - copper value
  smartphone_device: "#06B6D4", // cyan   - whole-unit resale
  peripheral_other: "#94A3B8", // slate  - low value
} as const;

export type ClassName = keyof typeof CLASS_COLORS;

export const UNIFIED_CLASSES: ClassName[] = [
  "battery",
  "hard_drive",
  "pcb",
  "motherboard",
  "ram",
  "copper_cable",
  "smartphone_device",
  "chip",
  "peripheral_other",
];

export const LOW_CONFIDENCE_THRESHOLD = 0.7;
export const AUTO_TRIGGER_THRESHOLD = 200;
