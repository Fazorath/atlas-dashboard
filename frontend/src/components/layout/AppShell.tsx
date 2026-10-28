/* Two navigations, one route list, split at 900px.

   Wide: a segmented pill in the middle of the header, the active item inverted
   to paper-on-black so it reads as a physical switch.

   Narrow: a floating bar clear of the bottom edge, icons only, where the active
   tab lights up in *its own section's* accent. That is the one place the whole
   palette is visible at once, and it is how you know which area you are in
   before the page has painted.

   The shell is exactly one screen tall and the document never scrolls: the
   inner column does. A `position: fixed` bar on a scrolling document is left
   mid-screen by iOS Home Screen apps once the layout viewport drifts from the
   visible one, so the bar is placed inside a box that cannot move. From 900px
   there is no tab bar and the document scrolls as usual, so the keyboard and
   the window scrollbar behave normally. */

import { NavLink, Outlet } from "react-router-dom";

import { AccountMenu } from "@/components/layout/AccountMenu";
import { navSections } from "@/lib/sections";
import { cn } from "@/lib/utils";

export function AppShell() {
  return (
    <div className="relative flex h-dvh flex-col bg-bg text-fg lap:block lap:h-auto lap:min-h-dvh">
      <div
        data-scroll-root
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain lap:overflow-visible"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <header className="mx-auto hidden w-full max-w-[1184px] items-center justify-between gap-6 px-12 pt-7 pb-2 lap:flex">
          <NavLink to="/" className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-9 place-items-center rounded-[12px] bg-sleep text-[18px] font-extrabold text-bg"
            >
              A
            </span>
            <span className="text-[22px] font-extrabold tracking-[-0.02em]">Atlas</span>
          </NavLink>

          <nav aria-label="Sections" className="flex items-center gap-1 rounded-full bg-surface p-[5px]">
            {navSections().map((section) => (
              <NavLink
                key={section.to}
                to={section.to}
                end={section.end}
                data-accent={section.accent}
                className={({ isActive }) =>
                  cn(
                    // The spec's 10px/20px padding lands at ~37px tall; min-h-11
                    // holds the 44px target without changing the padding.
                    "inline-flex min-h-11 items-center rounded-full px-5 py-2.5 text-[14px] transition-colors duration-200 ease-out",
                    isActive
                      ? "bg-fg font-bold text-bg"
                      : "font-semibold text-fg-muted hover:text-fg",
                  )
                }
              >
                {section.label}
              </NavLink>
            ))}
          </nav>

          <AccountMenu />
        </header>

        <main className="mx-auto w-full max-w-[1184px] px-[18px] pt-7 pb-[100px] lap:px-12 lap:pb-10">
          <Outlet />
        </main>
      </div>

      <TabBar />
    </div>
  );
}

function TabBar() {
  return (
    <nav
      aria-label="Sections"
      className="absolute z-20 flex h-[68px] items-center justify-around rounded-full border border-border-subtle bg-surface-2 px-2 lap:hidden"
      style={{
        bottom: "max(20px, env(safe-area-inset-bottom))",
        left: "max(18px, env(safe-area-inset-left))",
        right: "max(18px, env(safe-area-inset-right))",
      }}
    >
      {navSections().map((section) => {
        const Icon = section.icon;
        return (
          <NavLink
            key={section.to}
            to={section.to}
            end={section.end}
            aria-label={section.label}
            data-accent={section.accent}
            className={({ isActive }) =>
              cn(
                "grid size-[52px] place-items-center rounded-full transition-colors duration-200 ease-out",
                isActive ? "bg-accent text-bg" : "text-fg-muted",
              )
            }
          >
            <Icon aria-hidden strokeWidth={2} className="size-6" />
          </NavLink>
        );
      })}
    </nav>
  );
}
