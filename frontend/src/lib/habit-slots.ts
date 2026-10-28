/* Today's habits has a fixed number of slots per Size, and no Habit may be
   hidden silently. When they don't all fit, the last slot goes to a "+N"
   marker, so 9 Habits in 8 slots show 7 and "+2". */

export function fitSlots<T>(habits: T[], capacity: number): { shown: T[]; overflow: number } {
  if (habits.length <= capacity) return { shown: habits, overflow: 0 };
  const shown = habits.slice(0, capacity - 1);
  return { shown, overflow: habits.length - shown.length };
}
