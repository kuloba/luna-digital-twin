/**
 * Demo clock. The twin always opens at 10:40 on the viewer's local clock and
 * runs in real time from there, so the day reads the same whenever it is
 * viewed: harvest under way, the 14:00 truck loading, the morning brief.
 * Swap `clockNow` for `Date.now` when this is wired to a live site.
 */
const OPEN_AT_MIN = 10 * 60 + 40;

const start = new Date();
const offset = (OPEN_AT_MIN - (start.getHours() * 60 + start.getMinutes())) * 60_000 - start.getSeconds() * 1000;

export const clockNow = () => Date.now() + offset;
