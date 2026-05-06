/**
 * /calibration — kept for backward-compat with bookmarked URLs.
 * Server-side redirect to /stats (the v1.1 rename per spec Workstream 3).
 */
import { redirect } from "next/navigation";

export default function CalibrationRedirect() {
  redirect("/stats");
}
