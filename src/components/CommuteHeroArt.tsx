import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { StyleSheet } from 'react-native';
import { tokens } from '../theme/tokens';
import type { ThemeColors } from '../theme/tokens';

interface CommuteHeroArtProps {
  colors: ThemeColors;
}

export function CommuteHeroArt({ colors }: CommuteHeroArtProps) {
  return (
    <Svg
      preserveAspectRatio="xMidYMid slice"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 400 360"
    >
      <Path
        d="M0 230 C55 204 82 213 130 188 C182 160 235 194 284 169 C332 145 366 164 400 138 L400 360 L0 360 Z"
        fill={colors.card}
        fillOpacity={tokens.opacity.heroArt}
      />
      <Path
        d="M0 232 C58 204 88 215 136 190 C184 164 236 195 284 171 C332 147 366 166 400 140"
        fill="none"
        stroke={colors.border}
        strokeOpacity={tokens.opacity.route}
        strokeWidth={tokens.border.illustration}
      />
      <Path
        d="M28 211 V177 H47 V198 H65 V164 H91 V185 H108 V151 H129 V182 M184 176 V146 H205 V163 H224 V137 H247 V173 M294 164 V132 H317 V150 H337 V119 H361 V155 H382"
        fill="none"
        stroke={colors.textSecondary}
        strokeOpacity={tokens.opacity.heroArt}
        strokeWidth={tokens.border.illustration}
      />
      <Path
        d="M34 330 C72 291 89 270 129 262 C177 252 192 221 231 211 C270 202 298 221 328 189 C350 166 353 143 376 128"
        fill="none"
        stroke={colors.textSecondary}
        strokeDasharray="8 10"
        strokeOpacity={tokens.opacity.route}
        strokeWidth={tokens.border.illustration}
      />
      <Circle
        cx="34"
        cy="330"
        fill={colors.cardInner}
        r="8"
        stroke={colors.textSecondary}
        strokeOpacity={tokens.opacity.route}
        strokeWidth={tokens.border.illustration}
      />
      <Circle
        cx="376"
        cy="128"
        fill={colors.cardInner}
        r="8"
        stroke={colors.textSecondary}
        strokeOpacity={tokens.opacity.route}
        strokeWidth={tokens.border.illustration}
      />
      <Rect
        fill={colors.background}
        fillOpacity={tokens.opacity.heroArt}
        height="360"
        width="400"
        x="0"
        y="0"
      />
    </Svg>
  );
}
