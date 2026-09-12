import type { Metadata } from "next";
import { MapExplorer } from "@/components/features/MapExplorer";

export const metadata: Metadata = {
  title: "Map",
  description: "Browse EV charging stations across Nepal on an interactive map.",
};

export default function MapPage() {
  return <MapExplorer />;
}
