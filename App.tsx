import {
  GolosText_500Medium,
  GolosText_700Bold,
  useFonts,
} from '@expo-google-fonts/golos-text';
import { CalendarDays, House, Settings2 } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text } from './src/components/AppText';
import { ClassesScreen } from './src/screens/ClassesScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { strings } from './src/i18n';
import {
  defaultSettings,
  loadSettings,
  saveSettings,
} from './src/services/preferences';
import { loadClasses, saveClasses } from './src/services/classStorage';
import { tokens } from './src/theme/tokens';
import type { ThemeColors } from './src/theme/tokens';
import type { Class, Settings, TransportMode } from './src/types';
import { getNextClass } from './src/utils/nextClass';

type Screen = 'home' | 'classes' | 'settings';
type LoadState = 'loading' | 'ready' | 'error';

const tabs: { key: Screen; icon: typeof House; label: 'home' | 'schedule' | 'settings' }[] = [
  { key: 'home', icon: House, label: 'home' },
  { key: 'classes', icon: CalendarDays, label: 'schedule' },
  { key: 'settings', icon: Settings2, label: 'settings' },
];

export default function App() {
  const [fontsLoaded] = useFonts({
    GolosText_500Medium,
    GolosText_700Bold,
  });
  const [classes, setClasses] = useState<Class[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [activeScreen, setActiveScreen] = useState<Screen>('home');
  const [openClassForm, setOpenClassForm] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [schoolAddressDraft, setSchoolAddressDraft] = useState('');
  const [schoolAddressError, setSchoolAddressError] = useState(false);
  const copy = strings[settings.language];
  const colors = tokens.color[settings.themeMode];
  const styles = useMemo(() => createStyles(colors), [colors]);

  const refreshData = useCallback(async () => {
    setLoadState('loading');
    try {
      const [savedClasses, savedSettings] = await Promise.all([
        loadClasses(),
        loadSettings(),
      ]);
      setClasses(savedClasses);
      setSettings(savedSettings);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const openClasses = (showForm: boolean) => {
    setActiveScreen('classes');
    setOpenClassForm(showForm);
  };

  const handleSaveClass = async (item: Class) => {
    const updated = classes.some((existing) => existing.id === item.id)
      ? classes.map((existing) => (existing.id === item.id ? item : existing))
      : [...classes, item];
    await saveClasses(updated);
    setClasses(updated);
    setOpenClassForm(false);
  };

  const handleImportClasses = async (imported: Class[]) => {
    const classKey = (item: Class) =>
      [
        item.dayOfWeek,
        item.startTime,
        item.name.trim().toLowerCase(),
        item.building.trim().toLowerCase(),
        item.room.trim().toLowerCase(),
      ].join('|');
    const existingKeys = new Set(classes.map(classKey));
    const newClasses = imported.filter((item) => {
      const key = classKey(item);
      if (existingKeys.has(key)) {
        return false;
      }
      existingKeys.add(key);
      return true;
    });
    const updated = [...classes, ...newClasses];
    await saveClasses(updated);
    setClasses(updated);
    return newClasses.length;
  };

  const handleDeleteClass = async (id: string) => {
    const updated = classes.filter((item) => item.id !== id);
    await saveClasses(updated);
    setClasses(updated);
  };

  const handleChangeSettings = async (updated: Settings) => {
    await saveSettings(updated);
    setSettings(updated);
  };

  const saveSchoolAddress = async () => {
    const schoolAddress = schoolAddressDraft.trim();
    if (!schoolAddress) {
      setSchoolAddressError(true);
      return;
    }

    setSchoolAddressError(false);
    try {
      await handleChangeSettings({ ...settings, schoolAddress });
    } catch {
      setSchoolAddressError(true);
    }
  };

  const handleSelectTransport = async (mode: TransportMode) => {
    const upcoming = getNextClass(classes);
    if (!upcoming) {
      await handleChangeSettings({ ...settings, defaultTransportMode: mode });
      return;
    }

    await handleSaveClass({
      ...upcoming.classItem,
      transportMode: mode,
    });
  };

  const navigate = (screen: Screen) => {
    setActiveScreen(screen);
    setOpenClassForm(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={settings.themeMode === 'dark' ? 'light' : 'dark'} />
      {loadState === 'loading' || (loadState === 'ready' && !fontsLoaded) ? (
        <View style={styles.messageState}>
          <Text style={styles.messageText}>{copy.loading}</Text>
        </View>
      ) : loadState === 'error' ? (
        <View style={styles.messageState}>
          <Text accessibilityRole="alert" style={styles.messageText}>
            {copy.storageError}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => void refreshData()}
            style={styles.activeButton}
          >
            <Text style={styles.activeButtonText}>{copy.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : !settings.schoolAddress.trim() ? (
        <View style={styles.schoolSetup}>
          <View style={styles.schoolSetupCard}>
            <Text style={styles.schoolSetupTitle}>
              {copy.schoolLocationTitle}
            </Text>
            <Text style={styles.messageText}>
              {copy.schoolLocationPrompt}
            </Text>
            <TextInput
              accessibilityLabel={copy.schoolLocationPlaceholder}
              autoCapitalize="none"
              onChangeText={setSchoolAddressDraft}
              onSubmitEditing={() => void saveSchoolAddress()}
              placeholder={copy.schoolLocationPlaceholder}
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
              style={styles.schoolAddressInput}
              value={schoolAddressDraft}
            />
            {schoolAddressError ? (
              <Text accessibilityRole="alert" style={styles.messageText}>
                {schoolAddressDraft.trim()
                  ? copy.saveError
                  : copy.requiredFields}
              </Text>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => void saveSchoolAddress()}
              style={styles.activeButton}
            >
              <Text style={styles.activeButtonText}>{copy.save}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.screen}>
            {activeScreen === 'home' ? (
              <HomeScreen
                classes={classes}
                colors={colors}
                copy={copy}
                schoolAddress={settings.schoolAddress}
                onAddClass={() => openClasses(true)}
                onSelectTransport={handleSelectTransport}
                settings={settings}
              />
            ) : activeScreen === 'classes' ? (
              <ClassesScreen
                classes={classes}
                colors={colors}
                copy={copy}
                defaultTransportMode={settings.defaultTransportMode}
                initialFormOpen={openClassForm}
                onImportClasses={handleImportClasses}
                onDelete={handleDeleteClass}
                onSave={handleSaveClass}
              />
            ) : (
              <SettingsScreen
                colors={colors}
                copy={copy}
                onChange={handleChangeSettings}
                settings={settings}
              />
            )}
          </View>
          <View style={styles.tabBar}>
            {tabs.map(({ key, icon: Icon, label }) => {
              const selected = activeScreen === key;
              return (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={key}
                  onPress={() => navigate(key)}
                  style={styles.tab}
                >
                  <Icon
                    color={selected ? colors.activeBg : colors.textSecondary}
                    size={tokens.icon.size - tokens.spacing[1]}
                    strokeWidth={tokens.icon.strokeWidth}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      selected && styles.activeTabText,
                    ]}
                  >
                    {copy[label]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: {
      backgroundColor: colors.background,
      flex: 1,
    },
    screen: {
      flex: 1,
    },
    messageState: {
      alignItems: 'center',
      flex: 1,
      gap: tokens.spacing[4],
      justifyContent: 'center',
      padding: tokens.spacing[6],
    },
    schoolSetup: {
      flex: 1,
      justifyContent: 'center',
      padding: tokens.spacing[5],
    },
    schoolSetupCard: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: tokens.radius.card,
      borderWidth: tokens.border.width,
      gap: tokens.spacing[4],
      padding: tokens.spacing[5],
    },
    schoolSetupTitle: {
      color: colors.textPrimary,
      fontFamily: tokens.type.familyBold,
      fontSize: tokens.type.size.title,
      lineHeight: tokens.type.lineHeight.title,
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
    messageText: {
      color: colors.textPrimary,
      fontFamily: tokens.type.family,
      fontSize: tokens.type.size.body,
      lineHeight: tokens.type.lineHeight.body,
      textAlign: 'center',
    },
    activeButton: {
      alignItems: 'center',
      backgroundColor: colors.activeBg,
      borderRadius: tokens.radius.pill,
      justifyContent: 'center',
      minHeight: tokens.icon.touchTarget,
      paddingHorizontal: tokens.spacing[5],
    },
    activeButtonText: {
      color: colors.activeText,
      fontFamily: tokens.type.familyBold,
      fontSize: tokens.type.size.body,
      lineHeight: tokens.type.lineHeight.body,
    },
    tabBar: {
      alignSelf: 'center',
      bottom: tokens.spacing[2],
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: tokens.radius.pill,
      borderWidth: tokens.border.width,
      flexDirection: 'row',
      gap: tokens.spacing[1],
      position: 'absolute',
      padding: tokens.spacing[1],
      width: tokens.layout.tabBarWidth,
    },
    tab: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'column',
      gap: tokens.spacing[1],
      justifyContent: 'center',
      minHeight: tokens.icon.touchTarget + tokens.spacing[1],
      paddingHorizontal: tokens.spacing[2],
    },
    tabText: {
      color: colors.textSecondary,
      fontFamily: tokens.type.family,
      fontSize: tokens.type.size.caption,
      lineHeight: tokens.type.lineHeight.caption,
    },
    activeTabText: {
      color: colors.activeBg,
      fontFamily: tokens.type.familyBold,
    },
  });
}
