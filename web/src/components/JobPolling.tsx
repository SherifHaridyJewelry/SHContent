import { useEffect } from "react";
import { startJobPolling } from "../stores/jobStore";

/** Mount once in layout to poll catalog + scene plate jobs while any are active. */
export default function JobPolling() {
  useEffect(() => startJobPolling(), []);
  return null;
}
