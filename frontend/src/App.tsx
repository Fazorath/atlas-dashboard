import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { areaEnabled } from "@/lib/config";
import { Habits } from "@/pages/Habits";
import { Health } from "@/pages/Health";
import { Listening } from "@/pages/Listening";
import { Money } from "@/pages/Money";
import { School } from "@/pages/School";
import { Status } from "@/pages/Status";
import { Today } from "@/pages/Today";
import { Weather } from "@/pages/Weather";
import { Work } from "@/pages/Work";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Today />} />
        {/* An Area whose module is off in atlas.yaml has no route; the
            catch-all sends an old bookmark home. */}
        {areaEnabled("health") ? <Route path="health" element={<Health />} /> : null}
        {/* The Area used to be called Sleep; old bookmarks still land. */}
        <Route path="sleep" element={<Navigate to="/health" replace />} />
        {areaEnabled("school") ? <Route path="school" element={<School />} /> : null}
        {areaEnabled("money") ? <Route path="money" element={<Money />} /> : null}
        {areaEnabled("habits") ? <Route path="habits" element={<Habits />} /> : null}
        {areaEnabled("weather") ? <Route path="weather" element={<Weather />} /> : null}
        {areaEnabled("listening") ? <Route path="listening" element={<Listening />} /> : null}
        {areaEnabled("work") ? <Route path="work" element={<Work />} /> : null}
        <Route path="status" element={<Status />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
