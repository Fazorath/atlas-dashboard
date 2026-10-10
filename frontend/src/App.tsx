import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { Habits } from "@/pages/Habits";
import { Money } from "@/pages/Money";
import { School } from "@/pages/School";
import { Sleep } from "@/pages/Sleep";
import { Today } from "@/pages/Today";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Today />} />
        <Route path="sleep" element={<Sleep />} />
        <Route path="school" element={<School />} />
        <Route path="money" element={<Money />} />
        <Route path="habits" element={<Habits />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
