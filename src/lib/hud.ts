/** HUD geometry the camera rig frames around (px). */
export const HUD = {
  top: 208,
  bottom: 220,
  left: 64,
  right: 412,
};

/** Insets for a given viewport width: panels are narrower below 1536 px (2xl). */
export function hudInsets(width: number) {
  return { ...HUD, right: width >= 1536 ? 412 : 380 };
}
