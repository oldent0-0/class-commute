import React from 'react';
import { Text as NativeText, type TextProps } from 'react-native';
import { tokens } from '../theme/tokens';

export function AppText({
  maxFontSizeMultiplier = tokens.type.maxFontSizeMultiplier,
  ...props
}: TextProps) {
  return (
    <NativeText
      {...props}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    />
  );
}
