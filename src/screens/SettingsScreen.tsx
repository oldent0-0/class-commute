import { Minus, Plus } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text } from '../components/AppText';
import { CommuteHeroArt } from '../components/CommuteHeroArt';
import type { Translation } from '../i18n';
import { homeBackgroundOptions } from '../theme/homeBackgrounds';
import { tokens } from '../theme/tokens';
import type { ThemeColors } from '../theme/tokens';
import type { Language, Settings, ThemeMode, TransportMode } from '../types';

type Copy = Translation;

interface SettingsScreenProps {
  settings: Settings;
  copy: Copy;
  colors: ThemeColors;
  onChange: (settings: Settings) => Promise<void>;
}

const modes: TransportMode[] = ['walk', 'bus', 'car', 'taxi'];
const modeLabels: Record<TransportMode, keyof Copy> = {
  walk: 'walk',
  bus: 'bus',
  car: 'car',
  taxi: 'taxi',
};

const languageLabels: Record<Language, keyof Copy> = {
  mn: 'languageMongolian',
  en: 'languageEnglish',
};

const themeLabels: Record<ThemeMode, keyof Copy> = {
  dark: 'darkMode',
  light: 'lightMode',
};

export function SettingsScreen({
  settings,
  copy,
  colors,
  onChange,
}: SettingsScreenProps) {
  const [saveError, setSaveError] = useState(false);
  const [schoolAddress, setSchoolAddress] = useState(settings.schoolAddress);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const update = async (changed: Settings) => {
    setSaveError(false);
    try {
      await onChange(changed);
    } catch {
      setSaveError(true);
    }
  };

  const saveSchoolAddress = async () => {
    if (!schoolAddress.trim()) {
      setSaveError(true);
      return;
    }
    await update({ ...settings, schoolAddress: schoolAddress.trim() });
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.scrollView}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{copy.settings}</Text>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.sectionTitle}>{copy.schoolLocationTitle}</Text>
        <Text style={styles.backgroundCredit}>
          {copy.schoolLocationPrompt}
        </Text>
        <TextInput
          accessibilityLabel={copy.schoolLocationPlaceholder}
          autoCapitalize="none"
          onChangeText={setSchoolAddress}
          placeholder={copy.schoolLocationPlaceholder}
          placeholderTextColor={colors.textSecondary}
          returnKeyType="done"
          style={styles.schoolAddressInput}
          value={schoolAddress}
        />
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => void saveSchoolAddress()}
          style={styles.option}
        >
          <Text style={styles.optionText}>{copy.save}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.sectionTitle}>{copy.appearance}</Text>
        <View style={styles.optionList}>
          {(['dark', 'light'] as ThemeMode[]).map((themeMode) => {
            const selected = settings.themeMode === themeMode;
            return (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={themeMode}
                onPress={() => void update({ ...settings, themeMode })}
                style={[styles.option, selected && styles.activeOption]}
              >
                <Text
                  style={[styles.optionText, selected && styles.activeOptionText]}
                >
                  {copy[themeLabels[themeMode]]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.sectionTitle}>{copy.homeBackground}</Text>
        <View style={styles.backgroundGrid}>
          {homeBackgroundOptions.map((option) => {
            const selected = settings.homeBackgroundId === option.id;
            return (
              <TouchableOpacity
                accessibilityLabel={copy[option.label]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={option.id}
                onPress={() =>
                  void update({ ...settings, homeBackgroundId: option.id })
                }
                style={styles.backgroundChoice}
              >
                <View
                  style={[
                    styles.backgroundPreview,
                    selected && styles.selectedBackgroundPreview,
                  ]}
                >
                  {option.source ? (
                    <Image
                      resizeMode="cover"
                      source={option.source}
                      style={styles.backgroundPreviewImage}
                    />
                  ) : (
                    <CommuteHeroArt colors={colors} />
                  )}
                </View>
                <Text
                  style={[
                    styles.backgroundLabel,
                    selected && styles.selectedBackgroundLabel,
                  ]}
                >
                  {copy[option.label]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.backgroundCredit}>
          {copy.backgroundImageCredit}
        </Text>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.sectionTitle}>{copy.buffer}</Text>
        <View style={styles.bufferRow}>
          <View style={styles.bufferControl}>
            <TouchableOpacity
              accessibilityLabel={copy.decreaseBuffer}
              accessibilityRole="button"
              disabled={settings.bufferMinutes === 0}
              onPress={() =>
                void update({
                  ...settings,
                  bufferMinutes: Math.max(0, settings.bufferMinutes - 5),
                })
              }
              style={styles.adjustButton}
            >
              <Minus color={colors.textPrimary} size={tokens.icon.size} strokeWidth={tokens.icon.strokeWidth} />
            </TouchableOpacity>
            <Text style={styles.bufferValue}>
              {settings.bufferMinutes} {copy.minutes}
            </Text>
            <TouchableOpacity
              accessibilityLabel={copy.increaseBuffer}
              accessibilityRole="button"
              onPress={() =>
                void update({
                  ...settings,
                  bufferMinutes: settings.bufferMinutes + 5,
                })
              }
              style={styles.adjustButton}
            >
              <Plus color={colors.textPrimary} size={tokens.icon.size} strokeWidth={tokens.icon.strokeWidth} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.sectionTitle}>{copy.defaultTransport}</Text>
        <View style={styles.optionList}>
          {modes.map((mode) => {
            const selected = settings.defaultTransportMode === mode;
            return (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={mode}
                onPress={() =>
                  void update({ ...settings, defaultTransportMode: mode })
                }
                style={[styles.option, selected && styles.activeOption]}
              >
                <Text style={[styles.optionText, selected && styles.activeOptionText]}>
                  {copy[modeLabels[mode]]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.sectionTitle}>{copy.language}</Text>
        <View style={styles.optionList}>
          {(['mn', 'en'] as Language[]).map((language) => {
            const selected = settings.language === language;
            return (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={language}
                onPress={() => void update({ ...settings, language })}
                style={[styles.option, selected && styles.activeOption]}
              >
                <Text
                  style={[styles.optionText, selected && styles.activeOptionText]}
                >
                  {copy[languageLabels[language]]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {saveError ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {copy.saveError}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  content: {
    gap: tokens.spacing[3],
    padding: tokens.spacing[4],
    paddingBottom: tokens.layout.tabBarClearance,
  },
  header: {
    marginBottom: tokens.spacing[2],
    minHeight: tokens.icon.touchTarget + tokens.spacing[2],
    justifyContent: 'center',
    paddingTop: 10,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: tokens.type.familyBold,
    fontSize: tokens.type.size.title,
    lineHeight: tokens.type.lineHeight.title,
  },
  settingsCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: tokens.radius.card,
    borderWidth: tokens.border.width,
    gap: tokens.spacing[3],
    padding: tokens.spacing[4],
  },
  schoolAddressInput: {
    backgroundColor: colors.cardInner,
    borderColor: colors.border,
    borderRadius: tokens.radius.field,
    borderWidth: tokens.border.width,
    color: colors.textPrimary,
    fontFamily: tokens.type.family,
    fontSize: tokens.type.size.body,
    minHeight: tokens.icon.touchTarget,
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
  },
  backgroundGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[3],
  },
  backgroundChoice: {
    gap: tokens.spacing[1],
    width: '47%',
  },
  backgroundPreview: {
    backgroundColor: colors.cardInner,
    borderColor: colors.border,
    borderRadius: tokens.radius.field,
    borderWidth: tokens.border.width,
    height: tokens.layout.backgroundPreviewHeight,
    overflow: 'hidden',
  },
  selectedBackgroundPreview: {
    borderColor: colors.activeBg,
  },
  backgroundPreviewImage: {
    height: '100%',
    width: '100%',
  },
  backgroundLabel: {
    color: colors.textSecondary,
    fontFamily: tokens.type.family,
    fontSize: tokens.type.size.caption,
    lineHeight: tokens.type.lineHeight.caption,
    textAlign: 'center',
  },
  selectedBackgroundLabel: {
    color: colors.textPrimary,
    fontFamily: tokens.type.familyBold,
  },
  backgroundCredit: {
    color: colors.textSecondary,
    fontFamily: tokens.type.family,
    fontSize: tokens.type.size.caption,
    lineHeight: tokens.type.lineHeight.caption,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: tokens.type.familyBold,
    fontSize: tokens.type.size.bodyLarge,
    lineHeight: tokens.type.lineHeight.bodyLarge,
  },
  bufferRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing[2],
  },
  bufferControl: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.spacing[2],
  },
  adjustButton: {
    alignItems: 'center',
    backgroundColor: colors.cardInner,
    borderRadius: tokens.radius.circle,
    height: tokens.icon.touchTarget,
    justifyContent: 'center',
    width: tokens.icon.touchTarget,
  },
  bufferValue: {
    color: colors.textPrimary,
    fontFamily: tokens.type.familyBold,
    fontSize: tokens.type.size.body,
    lineHeight: tokens.type.lineHeight.body,
    fontVariant: tokens.type.tabularNums,
  },
  optionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
  option: {
    alignItems: 'center',
    backgroundColor: colors.cardInner,
    borderRadius: tokens.radius.pill,
    justifyContent: 'center',
    minHeight: tokens.icon.touchTarget,
    paddingHorizontal: tokens.spacing[4],
  },
  activeOption: {
    backgroundColor: colors.activeBg,
  },
  optionText: {
    color: colors.textPrimary,
    fontFamily: tokens.type.family,
    fontSize: tokens.type.size.body,
    lineHeight: tokens.type.lineHeight.body,
  },
  activeOptionText: {
    color: colors.activeText,
    fontFamily: tokens.type.familyBold,
  },
  errorText: {
    color: colors.textSecondary,
    fontFamily: tokens.type.family,
    fontSize: tokens.type.size.body,
    lineHeight: tokens.type.lineHeight.body,
  },
  });
}
