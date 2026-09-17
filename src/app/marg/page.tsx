import type { Metadata } from "next";
import { MargPlanner } from "@/components/features/MargPlanner";

export const metadata: Metadata = {
  title: "E Sakhi Marg",
  description:
    "Plan an EV journey across Nepal — enter your starting point and destination and get a complete route with real charging checkpoints along the way.",
};

export default function MargPage() {
  return <MargPlanner />;
}
