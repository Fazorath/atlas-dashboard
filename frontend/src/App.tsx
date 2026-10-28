import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { apiUnreachable, areaEnabled, reloadConfig, setupNeeded, useConfig } from "@/lib/config";
import { CustomArea } from "@/pages/CustomArea";
import { Habits } from "@/pages/Habits";
import { Health } from "@/pages/Health";
import { Listening } from "@/pages/Listening";
import { Money } from "@/pages/Money";
import { School } from "@/pages/School";
import { Setup } from "@/pages/Setup";
import { Status } from "@/pages/Status";
import { Today } from "@/pages/Today";
import { Weather } from "@/pages/Weather";
import { Work } from "@/pages/Work";

export function App() {
  // Re-render every route when a Save changes which modules are on.
  useConfig();
  const { pathname } = useLocation();

  // Without the config every Area would look "Set up" and Status would look
  // healthy, so say what is actually wrong.
  if (apiUnreachable()) return <ApiUnreachable />;

  // A fresh install (no config/atlas.yaml) has nothing to show but Setup.
  if (setupNeeded() && pathname !== "/setup") return <Navigate to="/setup" replace />;

  return (
    <Routes>
      <Route path="setup" element={<Setup />} />
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
        <Route path="c/:module" element={<CustomArea />} />
        <Route path="status" element={<Status />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function ApiUnreachable() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-4">
      <h1 className="text-[24px] font-bold">API unreachable</h1>
      <p className="text-[15px] leading-snug text-fg-muted">
        The page loaded, but <code>atlas-api</code> isn&rsquo;t answering. It may be down or still
        starting. Run <code>docker compose logs atlas-api</code> on the host; the error names the
        file and key.
      </p>
      <Button variant="solid" onClick={() => void reloadConfig()}>
        Try again
      </Button>
    </main>
  );
}
