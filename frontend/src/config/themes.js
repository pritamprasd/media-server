export const THEMES = {
  neumorphic: {
    label: "Neumorphic",
    modes: ["dark", "light"],
    description: "Soft shadows with depth and texture",
  },
  material: {
    label: "Material",
    modes: ["dark", "light"],
    description: "Flat design with clean elevation",
  },
  offbeat: {
    label: "Offbeat",
    modes: ["dark", "light"],
    description: "Warm earthy tones with subtle accent tints",
  },
};

export const DEFAULT_THEME = { style: "neumorphic", mode: "dark" };

export const THEME_LIST = Object.entries(THEMES).map(([key, val]) => ({
  id: key,
  ...val,
}));
