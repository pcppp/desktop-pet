export const PIXEL_PET_CANVAS_WIDTH = 32;
export const PIXEL_PET_CANVAS_HEIGHT = 42;
export const PIXEL_PET_DISPLAY_WIDTH = 148;
export const PIXEL_PET_DISPLAY_HEIGHT = 176;

function mirrorBitmap(bitmap) {
  return bitmap.map((row) => row.split("").reverse().join(""));
}

const BITMAPS = {
  hairBack: [
    ".....ooHHHHHHoo.....",
    "...ooHhhhhhhhhHoo...",
    "..oHhhhhgggghhhhHo..",
    ".oHhhhgggggggghhhHo.",
    ".oHhhgggggggggghhHo.",
    "ooHhhgggggggggghhHoo",
    "oHhhhhgggggggghhhhHo",
    "oHhhhhhhhhhhhhhhhhHo",
    "oHhhhhhhhhhhhhhhhhHo",
    ".oHhhhhhhhhhhhhhhHo.",
    ".ooHhhhhhhhhhhhhHoo.",
    "..ooHHHHHHHHHHHHoo..",
    "...oooooooooooooo..."
  ],
  ribbonLeft: [
    ".oo.",
    "obbo",
    "obbo",
    ".oo."
  ],
  head: [
    "...oooooooooo...",
    "..oSSssssssSSo..",
    ".oSssssssssssSo.",
    "oSssssssssssssSo",
    "oSssssssssssssSo",
    "oSssssssssssssSo",
    "oSssssssssssssSo",
    "oSssssssssssssSo",
    "oSssssssssssssSo",
    ".oSssssssssssSo.",
    "..oSSssssssSSo..",
    "...oooooooooo..."
  ],
  bangs: [
    "...ooHHHHHHoo...",
    "..oHhhhhhhhhHo..",
    ".oHhhgggggghhHo.",
    ".oHhhhhhghhhhHo.",
    "..oo......oo...."
  ],
  sideLockLeft: [
    ".oo.",
    "oHHo",
    "oHHo",
    "oHHo",
    "oHHo",
    "oHHo",
    "oHHo",
    ".oo."
  ],
  sleeveLeft: [
    ".oo.",
    "oDDo",
    "oSSo",
    "oSSo",
    "oSSo",
    ".oo."
  ],
  body: [
    "...oooooooo...",
    "..occcccccco..",
    ".oDccccccccDo.",
    "oDDddddddddDDo",
    "oDddddddddddDo",
    "oDddddddddddDo",
    "oDddddddddddDo",
    ".oDddddddddDo.",
    "..oDDDDDDDDDo..",
    "...oooooooo..."
  ],
  skirt: [
    "...oooooooooo...",
    "..oDDDDDDDDDo..",
    ".oDDDDDDDDDDDo.",
    "oDDDDDDDDDDDDDo",
    "oDDooDDDDooDDDo",
    ".oo........oo.."
  ],
  leg: [
    ".oo.",
    "oSSo",
    "oSSo",
    ".oo."
  ],
  shoe: [
    "ooo.",
    "okk."
  ],
  badge: [
    ".oo.",
    "oBBo",
    "oBio",
    ".oo."
  ],
  eyeOpen: [
    "ee",
    "ee"
  ],
  eyeBlink: [
    "ee"
  ],
  mouthSmile: [
    "eee"
  ],
  mouthOpen: [
    ".e.",
    "eee"
  ],
  blush: [
    "ppp"
  ],
  sparkle: [
    ".i.",
    "iii",
    ".i."
  ]
};

BITMAPS.ribbonRight = mirrorBitmap(BITMAPS.ribbonLeft);
BITMAPS.sideLockRight = mirrorBitmap(BITMAPS.sideLockLeft);
BITMAPS.sleeveRight = mirrorBitmap(BITMAPS.sleeveLeft);

const PRESET_PALETTES = {
  default: {
    o: "#24160e",
    h: "#d08754",
    H: "#93552f",
    g: "#f7d5a4",
    s: "#f7e2c7",
    S: "#e0b98c",
    d: "#fff2e8",
    D: "#ef8a5e",
    b: "#f2a5b2",
    B: "#ffe089",
    i: "#6b3513",
    e: "#120c09",
    p: "#f5a0b9",
    k: "#3a2418",
    c: "#fffaf1"
  },
  sakura: {
    o: "#24160e",
    h: "#df8da2",
    H: "#9d5268",
    g: "#ffd8e1",
    s: "#f7e2c7",
    S: "#e0b98c",
    d: "#fff5f8",
    D: "#ef8eab",
    b: "#ffb8c8",
    B: "#ffe38f",
    i: "#7a3b1a",
    e: "#120c09",
    p: "#f6adc2",
    k: "#3a2418",
    c: "#fff9fb"
  },
  mint: {
    o: "#1f1812",
    h: "#6bc5a8",
    H: "#377868",
    g: "#d2fff1",
    s: "#f7e2c7",
    S: "#e0b98c",
    d: "#f3fffb",
    D: "#5cc9b0",
    b: "#91ebd6",
    B: "#d9fff0",
    i: "#255646",
    e: "#120c09",
    p: "#f0a9bc",
    k: "#2d2720",
    c: "#f8fffd"
  },
  moonlight: {
    o: "#1d1720",
    h: "#6d72ce",
    H: "#3b407e",
    g: "#d8dbff",
    s: "#f5dfc7",
    S: "#d8b18a",
    d: "#f5f1ff",
    D: "#9fa4f0",
    b: "#d8b8ff",
    B: "#f5dcff",
    i: "#59407d",
    e: "#110d15",
    p: "#f0a8c2",
    k: "#2d2435",
    c: "#fcf9ff"
  }
};

function frame(duration, overrides = {}) {
  return {
    duration,
    rootX: 0,
    rootY: 0,
    eyes: "open",
    mouth: "smile",
    glow: 0,
    parts: {},
    ...overrides
  };
}

const MOTION_ANIMATIONS = {
  sweet: {
    idle: [
      frame(260),
      frame(260, {
        rootY: -1,
        parts: {
          hairBack: { y: -1 },
          ribbonLeft: { y: -1 },
          ribbonRight: { y: -1 },
          sideLockLeft: { y: 1 },
          sideLockRight: { y: 1 },
          skirt: { y: 1 }
        }
      }),
      frame(260, {
        rootY: -2,
        parts: {
          hairBack: { y: -1 },
          bangs: { y: -1 },
          body: { y: -1 },
          skirt: { y: 1 },
          sleeveLeft: { y: -1 },
          sleeveRight: { y: -1 }
        }
      }),
      frame(260, {
        rootY: -1,
        eyes: "blink",
        parts: {
          sideLockLeft: { y: 1 },
          sideLockRight: { y: 1 }
        }
      })
    ],
    click: [
      frame(100, {
        rootY: -2,
        mouth: "open",
        parts: {
          sleeveLeft: { x: -1, y: -2 },
          sleeveRight: { x: 1, y: -2 },
          skirt: { y: 1 }
        }
      }),
      frame(110, {
        rootY: -4,
        mouth: "open",
        parts: {
          hairBack: { y: -1 },
          ribbonLeft: { y: -2 },
          ribbonRight: { y: -2 },
          sleeveLeft: { x: -1, y: -3 },
          sleeveRight: { x: 1, y: -3 },
          skirt: { y: 2 }
        }
      }),
      frame(140, {
        rootY: -1,
        parts: {
          sideLockLeft: { y: 1 },
          sideLockRight: { y: 1 }
        }
      }),
      frame(120)
    ],
    reply: [
      frame(120, {
        rootY: -1,
        glow: 0.22,
        mouth: "open",
        parts: {
          ribbonLeft: { y: -1 },
          ribbonRight: { y: -1 }
        }
      }),
      frame(120, {
        rootY: -3,
        glow: 0.34,
        mouth: "open",
        parts: {
          hairBack: { y: -2 },
          bangs: { y: -1 },
          sideLockLeft: { x: -1, y: 1 },
          sideLockRight: { x: 1, y: 1 },
          sleeveLeft: { x: -1, y: -2 },
          sleeveRight: { x: 1, y: -2 },
          skirt: { y: 2 },
          sparkleLeft: { y: -1 },
          sparkleRight: { y: -1 }
        }
      }),
      frame(120, {
        rootY: -2,
        glow: 0.28,
        parts: {
          sideLockLeft: { y: 1 },
          sideLockRight: { y: 1 },
          sparkleLeft: { x: -1 },
          sparkleRight: { x: 1 }
        }
      }),
      frame(140, {
        rootY: -1,
        glow: 0.16,
        eyes: "blink"
      })
    ]
  },
  peppy: {
    idle: [
      frame(180),
      frame(180, {
        rootY: -2,
        mouth: "open",
        parts: {
          hairBack: { y: -1 },
          ribbonLeft: { y: -2 },
          ribbonRight: { y: -2 },
          sleeveLeft: { x: -1, y: -1 },
          sleeveRight: { x: 1, y: -1 },
          skirt: { y: 2 }
        }
      }),
      frame(180, {
        rootY: -3,
        parts: {
          sideLockLeft: { x: -1, y: 1 },
          sideLockRight: { x: 1, y: 1 },
          skirt: { y: 2 }
        }
      }),
      frame(180, {
        rootY: -1,
        eyes: "blink"
      })
    ],
    click: [
      frame(90, {
        rootY: -3,
        mouth: "open",
        parts: {
          sleeveLeft: { x: -1, y: -3 },
          sleeveRight: { x: 1, y: -3 }
        }
      }),
      frame(90, {
        rootY: -5,
        mouth: "open",
        parts: {
          hairBack: { y: -2 },
          sideLockLeft: { x: -1, y: 2 },
          sideLockRight: { x: 1, y: 2 },
          ribbonLeft: { y: -2 },
          ribbonRight: { y: -2 },
          sleeveLeft: { x: -1, y: -4 },
          sleeveRight: { x: 1, y: -4 },
          skirt: { y: 3 }
        }
      }),
      frame(100, {
        rootY: -2,
        parts: {
          sideLockLeft: { y: 1 },
          sideLockRight: { y: 1 }
        }
      }),
      frame(100)
    ],
    reply: [
      frame(90, {
        rootY: -2,
        glow: 0.24,
        mouth: "open",
        parts: {
          sparkleLeft: { y: -1 },
          sparkleRight: { y: -1 }
        }
      }),
      frame(90, {
        rootY: -4,
        glow: 0.38,
        mouth: "open",
        parts: {
          hairBack: { y: -2 },
          ribbonLeft: { y: -2 },
          ribbonRight: { y: -2 },
          sideLockLeft: { x: -1, y: 2 },
          sideLockRight: { x: 1, y: 2 },
          sleeveLeft: { x: -1, y: -3 },
          sleeveRight: { x: 1, y: -3 },
          skirt: { y: 3 },
          sparkleLeft: { x: -1, y: -2 },
          sparkleRight: { x: 1, y: -2 }
        }
      }),
      frame(100, {
        rootY: -2,
        glow: 0.24,
        eyes: "blink"
      }),
      frame(110, {
        glow: 0.12
      })
    ]
  },
  shy: {
    idle: [
      frame(320, {
        rootX: -1,
        parts: {
          sideLockLeft: { y: 1 }
        }
      }),
      frame(320, {
        rootX: 0,
        rootY: -1,
        parts: {
          hairBack: { y: -1 },
          skirt: { y: 1 }
        }
      }),
      frame(320, {
        rootX: 1,
        eyes: "blink",
        parts: {
          sideLockRight: { y: 1 }
        }
      }),
      frame(320, {
        rootX: 0
      })
    ],
    click: [
      frame(120, {
        rootX: -1,
        rootY: -1,
        mouth: "open",
        parts: {
          sleeveLeft: { x: -1, y: -1 },
          sleeveRight: { x: 1, y: -1 }
        }
      }),
      frame(120, {
        rootX: 1,
        rootY: -2,
        mouth: "open",
        parts: {
          ribbonLeft: { y: -1 },
          ribbonRight: { y: -1 },
          sideLockLeft: { y: 1 },
          sideLockRight: { y: 1 },
          sleeveLeft: { x: -1, y: -2 },
          sleeveRight: { x: 1, y: -2 }
        }
      }),
      frame(140, {
        rootX: 0,
        eyes: "blink"
      }),
      frame(120)
    ],
    reply: [
      frame(130, {
        rootY: -1,
        glow: 0.18,
        mouth: "open"
      }),
      frame(130, {
        rootX: -1,
        rootY: -2,
        glow: 0.28,
        parts: {
          sparkleLeft: { y: -1 },
          sparkleRight: { y: -1 }
        }
      }),
      frame(130, {
        rootX: 1,
        rootY: -2,
        glow: 0.22,
        eyes: "blink",
        parts: {
          sideLockLeft: { y: 1 },
          sideLockRight: { y: 1 }
        }
      }),
      frame(140, {
        glow: 0.1
      })
    ]
  }
};

export function getPixelPetPalette(presetId) {
  return PRESET_PALETTES[presetId] || PRESET_PALETTES.default;
}

export function getPixelPetAnimation(motionModule, animationName) {
  const motionAnimations = MOTION_ANIMATIONS[motionModule] || MOTION_ANIMATIONS.sweet;
  return motionAnimations[animationName] || motionAnimations.idle;
}

export function getPixelPetRenderParts() {
  return [
    { id: "hairBack", asset: "hairBack", x: 6, y: 4 },
    { id: "ribbonLeft", asset: "ribbonLeft", x: 7, y: 7 },
    { id: "ribbonRight", asset: "ribbonRight", x: 21, y: 7 },
    { id: "sideLockLeft", asset: "sideLockLeft", x: 6, y: 13 },
    { id: "sideLockRight", asset: "sideLockRight", x: 22, y: 13 },
    { id: "head", asset: "head", x: 8, y: 10 },
    { id: "body", asset: "body", x: 9, y: 23 },
    { id: "sleeveLeft", asset: "sleeveLeft", x: 6, y: 24 },
    { id: "sleeveRight", asset: "sleeveRight", x: 22, y: 24 },
    { id: "skirt", asset: "skirt", x: 8, y: 31 },
    { id: "legLeft", asset: "leg", x: 11, y: 36 },
    { id: "legRight", asset: "leg", x: 17, y: 36 },
    { id: "shoeLeft", asset: "shoe", x: 10, y: 40 },
    { id: "shoeRight", asset: "shoe", x: 17, y: 40 },
    { id: "bangs", asset: "bangs", x: 8, y: 8 },
    { id: "badge", asset: "badge", x: 20, y: 24 },
    { id: "eyeLeft", feature: "eyes", x: 13, y: 16 },
    { id: "eyeRight", feature: "eyes", x: 18, y: 16 },
    { id: "blushLeft", asset: "blush", x: 11, y: 20 },
    { id: "blushRight", asset: "blush", x: 18, y: 20 },
    { id: "mouth", feature: "mouth", x: 15, y: 21 },
    { id: "sparkleLeft", asset: "sparkle", x: 4, y: 12, onlyWhen: "reply" },
    { id: "sparkleRight", asset: "sparkle", x: 25, y: 12, onlyWhen: "reply" }
  ];
}

export function getPixelPetBitmap(assetName, variant) {
  if (assetName === "eyes") {
    return variant === "blink" ? BITMAPS.eyeBlink : BITMAPS.eyeOpen;
  }

  if (assetName === "mouth") {
    return variant === "open" ? BITMAPS.mouthOpen : BITMAPS.mouthSmile;
  }

  return BITMAPS[assetName] || [];
}
