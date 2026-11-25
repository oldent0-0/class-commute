export const colorThemes = {
  dark: {
    background: '#0A0A0B',
    card: '#111112',
    cardInner: '#1A1A1C',
    border: '#2A2A2D',
    textPrimary: '#FFFFFF',
    textSecondary: '#8E8E93',
    activeBg: '#FFFFFF',
    activeText: '#0A0A0B',
    success: '#34C759',
    warning: '#FFB020',
    danger: '#FF2D55',
    accent: '#1FB5A8',
  },
  light: {
    background: '#F4F4F6',
    card: '#FFFFFF',
    cardInner: '#ECECEF',
    border: '#DEDEE3',
    textPrimary: '#111113',
    textSecondary: '#303036',
    activeBg: '#0A0A0B',
    activeText: '#FFFFFF',
    success: '#248A3D',
    warning: '#A65F00',
    danger: '#D01943',
    accent: '#168E84',
  },
} as const;

export type ThemeColors =
  | typeof colorThemes.dark
  | typeof colorThemes.light;

export const tokens = {
  color: colorThemes,
  photoText: {
    dark: {
      primary: '#FFFFFF',
      secondary: '#E5E5E7',
      edge: '#0A0A0B',
    },
    light: {
      primary: '#0A0A0B',
      secondary: '#303036',
      edge: '#FFFFFF',
    },
  },
  effect: {
    textEdgeRadius: 1,
    textEdgeOffset: { width: 0, height: 0 },
  },
  animation: {
    scrollEventThrottle: 16,
  },
  spacing: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
  },
  radius: {
    card: 24,
    field: 16,
    pill: 999,
    circle: 999,
  },
  border: {
    width: 1,
    illustration: 1,
  },
  opacity: {
    heroArt: 0.72,
    headerScrolled: 1,
    route: 0.9,
  },
  layout: {
    heroMinimum: 400,
    panelMinimum: 240,
    scheduleMinimum: 80,
    transportControlHeight: 72,
    homeHeaderHeight: 68,
    stickyHeaderZIndex: 1,
    headerFadeInDistance: 120,
    headerSloganPadding: 30,
    sloganTextBottomPadding: 10,
    tabBarClearance: 96,
    tabBarWidth: '75%',
    backgroundPreviewHeight: 88,
  },
  type: {
    family: 'GolosText_500Medium',
    familyBold: 'GolosText_700Bold',
    maxFontSizeMultiplier: 1.25,
    weight: {
      medium: '500' as const,
      bold: '700' as const,
    },
    size: {
      caption: 12,
      body: 14,
      bodyLarge: 16,
      title: 22,
      heading: 28,
      display: 52,
    },
    lineHeight: {
      caption: 16,
      body: 20,
      bodyLarge: 24,
      title: 28,
      heading: 36,
      display: 68,
    },
    tabularNums: ['tabular-nums'],
  },
  icon: {
    strokeWidth: 2,
    size: 20,
    touchTarget: 44,
  },
} as const;
