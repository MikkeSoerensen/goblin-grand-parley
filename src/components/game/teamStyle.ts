import type { TeamId } from "../../../shared/types";

// Literal class names, so Tailwind keeps them.
export const TEAM_STYLE: Record<TeamId, { chip: string; ring: string; dot: string; bar: string }> = {
  red: { chip: "bg-red-600/80 text-white border-red-400", ring: "ring-red-500", dot: "bg-red-500", bar: "border-l-red-500" },
  blue: { chip: "bg-blue-600/80 text-white border-blue-400", ring: "ring-blue-500", dot: "bg-blue-500", bar: "border-l-blue-500" },
  green: { chip: "bg-green-600/80 text-white border-green-400", ring: "ring-green-500", dot: "bg-green-500", bar: "border-l-green-500" },
  yellow: { chip: "bg-yellow-400/90 text-stone-900 border-yellow-200", ring: "ring-yellow-400", dot: "bg-yellow-400", bar: "border-l-yellow-400" },
  purple: { chip: "bg-purple-600/80 text-white border-purple-400", ring: "ring-purple-500", dot: "bg-purple-500", bar: "border-l-purple-500" },
  orange: { chip: "bg-orange-500/90 text-white border-orange-300", ring: "ring-orange-500", dot: "bg-orange-500", bar: "border-l-orange-500" },
  pink: { chip: "bg-pink-500/90 text-white border-pink-300", ring: "ring-pink-500", dot: "bg-pink-500", bar: "border-l-pink-500" },
  teal: { chip: "bg-teal-600/80 text-white border-teal-400", ring: "ring-teal-500", dot: "bg-teal-500", bar: "border-l-teal-500" },
};
