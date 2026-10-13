import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
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
        <Route path="health" element={<Health />} />
        {/* The Area was called Sleep until 2026-10; old bookmarks still land. */}
        <Route path="sleep" element={<Navigate to="/health" replace />} />
        <Route path="school" element={<School />} />
        <Route path="money" element={<Money />} />
        <Route path="habits" element={<Habits />} />
        <Route path="weather" element={<Weather />} />
        <Route path="listening" element={<Listening />} />
        <Route path="work" element={<Work />} />
        <Route path="status" element={<Status />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
