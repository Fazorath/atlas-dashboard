/* A Custom module's own Area, at /c/<module id>. Reached by tapping its
   Widgets; it has no nav entry. */

import { Navigate, useParams } from "react-router-dom";

import { AreaBoard } from "@/components/board/AreaBoard";
import { areaEnabled } from "@/lib/config";

export function CustomArea() {
  const { module = "" } = useParams();
  return areaEnabled(module) ? <AreaBoard area={module} /> : <Navigate to="/" replace />;
}
