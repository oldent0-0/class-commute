import { Clock3, FileUp, Pencil, Plus, Trash2 } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text } from '../components/AppText';
import { strings } from '../i18n';
import type { Translation } from '../i18n';
import { tokens } from '../theme/tokens';
import type { ThemeColors } from '../theme/tokens';
import type { Class, DayOfWeek, TransportMode } from '../types';
import {
  parseSchedulePdf,
  type ParsedScheduleClass,
} from '../services/schedulePdfImport';

type Copy = Translation;

interface ClassesScreenProps {
  classes: Class[];
  copy: Copy;
  colors: ThemeColors;
  defaultTransportMode: TransportMode;
  onSave: (item: Class) => Promise<void>;
  onImportClasses: (items: Class[]) => Promise<number>;
  onDelete: (id: string) => Promise<void>;
  initialFormOpen?: boolean;
}

const weekdays: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const modeLabels: Record<TransportMode, keyof Copy> = {
  walk: 'walk',
  bus: 'bus',
  car: 'car',
  taxi: 'taxi',
};

interface ClassDraft {
  name: string;
  building: string;
  room: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  transportMode: TransportMode;
}

function emptyDraft(transportMode: TransportMode): ClassDraft {
  return {
    name: '',
    building: '',
    room: '',
    dayOfWeek: 'monday',
    startTime: '',
    transportMode,
  };
}

export function ClassesScreen({
  classes,
  copy,
  colors,
  defaultTransportMode,
  onSave,
  onImportClasses,
  onDelete,
  initialFormOpen = false,
}: ClassesScreenProps) {
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [formOpen, setFormOpen] = React.useState(initialFormOpen);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<ClassDraft>(
    emptyDraft(defaultTransportMode),
  );
  const [validationMessage, setValidationMessage] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<Class | null>(null);
  const [importRows, setImportRows] = React.useState<ParsedScheduleClass[] | null>(null);
  const [periodTimes, setPeriodTimes] = React.useState<Record<number, string>>({});
  const [importBusy, setImportBusy] = React.useState(false);
  const [importError, setImportError] = React.useState('');
  const [importMessage, setImportMessage] = React.useState('');
  const [activePeriod, setActivePeriod] = React.useState<number | null>(null);
  const importPeriods = React.useMemo(
    () =>
      importRows
        ? [...new Set(importRows.map((item) => item.period))].sort(
            (first, second) => first - second,
          )
        : [],
    [importRows],
  );

  const openNewForm = () => {
    setEditingId(null);
    setDraft(emptyDraft(defaultTransportMode));
    setValidationMessage('');
    setFormOpen(true);
  };

  const openEditForm = (item: Class) => {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      building: item.building,
      room: item.room,
      dayOfWeek: item.dayOfWeek,
      startTime: item.startTime,
      transportMode: item.transportMode,
    });
    setValidationMessage('');
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!draft.name.trim() || !draft.building.trim() || !draft.room.trim()) {
      setValidationMessage(copy.requiredFields);
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.startTime)) {
      setValidationMessage(copy.invalidTime);
      return;
    }

    setSaving(true);
    setValidationMessage('');
    try {
      await onSave({
        ...draft,
        id: editingId ?? Date.now().toString(),
        name: draft.name.trim(),
        building: draft.building.trim(),
        room: draft.room.trim(),
      });
      setFormOpen(false);
    } catch {
      setValidationMessage(copy.saveError);
    } finally {
      setSaving(false);
    }
  };

  const removeClass = async () => {
    if (!pendingDelete) {
      return;
    }
    try {
      await onDelete(pendingDelete.id);
      setPendingDelete(null);
    } catch {
      setValidationMessage(copy.saveError);
      setPendingDelete(null);
    }
  };

  const chooseSchedulePdf = async () => {
    setImportError('');
    setImportMessage('');
    setImportBusy(true);
    try {
      let data: Uint8Array;
      if (Platform.OS === 'web') {
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/pdf',
          copyToCacheDirectory: true,
          multiple: false,
          base64: true,
        });
        if (result.canceled) {
          return;
        }
        const asset = result.assets[0];
        if (asset.file) {
          data = new Uint8Array(await asset.file.arrayBuffer());
        } else if (asset.base64) {
          data = decodeBase64(asset.base64);
        } else {
          throw new Error('The selected PDF could not be read.');
        }
      } else {
        const result = await FileSystem.File.pickFileAsync({
          mimeTypes: 'application/pdf',
        });
        if (result.canceled) {
          return;
        }
        data = await result.result.bytes();
      }

      const parsed = await parseSchedulePdf(data);
      setImportRows(parsed);
      setPeriodTimes(
        Object.fromEntries(
          [...new Set(parsed.map((item) => item.period))].map((period) => [
            period,
            '',
          ]),
        ),
      );
    } catch (error) {
      console.error('Failed to read the schedule PDF', error);
      setImportError(copy.importPdfError);
    } finally {
      setImportBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!importRows) {
      return;
    }
    if (
      importPeriods.some(
        (period) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(periodTimes[period] ?? ''),
      )
    ) {
      setImportError(copy.invalidTime);
      return;
    }

    setImportBusy(true);
    setImportError('');
    try {
      const imported = importRows.map((item, index) => ({
        ...item,
        id: `${Date.now()}-${index}`,
        startTime: periodTimes[item.period],
        transportMode: defaultTransportMode,
      }));
      const count = await onImportClasses(imported);
      setImportRows(null);
      setPeriodTimes({});
      setImportMessage(
        count === 0
          ? copy.importNoNewClasses
          : copy.importSuccess.replace('{count}', String(count)),
      );
    } catch (error) {
      console.error('Failed to save imported schedule classes', error);
      setImportError(copy.saveError);
    } finally {
      setImportBusy(false);
    }
  };

  const cancelImport = () => {
    setImportRows(null);
    setPeriodTimes({});
    setImportError('');
    setActivePeriod(null);
  };

  const updatePeriodTime = (period: number, date: Date) => {
    setPeriodTimes((current) => ({
      ...current,
      [period]: formatTime(date),
    }));
    setImportError('');
  };

  const openPeriodPicker = (period: number) => {
    setImportError('');
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: dateFromTime(periodTimes[period] || '09:00'),
        mode: 'time',
        is24Hour: false,
        design: 'material',
        initialInputMode: 'keyboard',
        onChange: (event, date) => {
          if (event.type === 'set' && date) {
            updatePeriodTime(period, date);
          }
        },
      });
      return;
    }
    setActivePeriod(period);
  };

  const field = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    placeholder: string,
    keyboardType: 'default' | 'numbers-and-punctuation' = 'default',
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType={keyboardType}
        maxFontSizeMultiplier={tokens.type.maxFontSizeMultiplier}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        value={value}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>
              {formOpen ? (editingId ? copy.edit : copy.addClass) : copy.schedule}
            </Text>
            {!formOpen ? (
              <Text style={styles.headerSubtitle}>
                {classes.length} {copy.classCount}
              </Text>
            ) : null}
          </View>
          {!formOpen && !importRows ? (
            <View style={styles.headerActions}>
              <TouchableOpacity
                accessibilityLabel={copy.importSchedule}
                accessibilityRole="button"
                disabled={importBusy}
                onPress={() => void chooseSchedulePdf()}
                style={styles.iconButton}
              >
                <FileUp color={colors.textPrimary} size={tokens.icon.size} strokeWidth={tokens.icon.strokeWidth} />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel={copy.addClass}
                accessibilityRole="button"
                onPress={openNewForm}
                style={styles.iconButton}
              >
                <Plus color={colors.textPrimary} size={tokens.icon.size} strokeWidth={tokens.icon.strokeWidth} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {importBusy && !importRows ? (
          <Text style={styles.helperText}>{copy.loading}</Text>
        ) : null}
        {importError ? (
          <Text accessibilityRole="alert" style={styles.helperText}>
            {importError}
          </Text>
        ) : null}
        {importMessage ? (
          <Text style={styles.helperText}>{importMessage}</Text>
        ) : null}

        {importRows ? (
          <View style={styles.formCard}>
            <Text style={styles.helperText}>
              {copy.importFound.replace('{count}', String(importRows.length))}
            </Text>
            {importPeriods.map((period) => {
              const label = copy.periodStartTime.replace(
                '{period}',
                String(period),
              );
              return (
                <View key={period} style={styles.field}>
                  <Text style={styles.label}>{label}</Text>
                  {Platform.OS === 'web' ? (
                    <TextInput
                      accessibilityLabel={label}
                      keyboardType="numbers-and-punctuation"
                      maxFontSizeMultiplier={tokens.type.maxFontSizeMultiplier}
                      onChangeText={(value) => {
                        setPeriodTimes({ ...periodTimes, [period]: value });
                        setImportError('');
                      }}
                      placeholder="09:00"
                      placeholderTextColor={colors.textSecondary}
                      style={styles.input}
                      value={periodTimes[period] ?? ''}
                    />
                  ) : (
                    <TouchableOpacity
                      accessibilityLabel={label}
                      accessibilityRole="button"
                      onPress={() => openPeriodPicker(period)}
                      style={styles.timePickerButton}
                    >
                      <Text
                        style={[
                          styles.timePickerText,
                          !periodTimes[period] && styles.timePickerPlaceholder,
                        ]}
                      >
                        {periodTimes[period] || '--:--'}
                      </Text>
                      <Clock3
                        color={colors.textSecondary}
                        size={tokens.icon.size}
                        strokeWidth={tokens.icon.strokeWidth}
                      />
                    </TouchableOpacity>
                  )}
                  {Platform.OS === 'ios' && activePeriod === period ? (
                    <View style={styles.iosTimePicker}>
                      <DateTimePicker
                        accentColor={colors.activeBg}
                        display="spinner"
                        is24Hour
                        mode="time"
                        onChange={(_event, date) => {
                          if (date) {
                            updatePeriodTime(period, date);
                          }
                        }}
                        textColor={colors.textPrimary}
                        value={dateFromTime(periodTimes[period] || '09:00')}
                      />
                      <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => setActivePeriod(null)}
                        style={styles.timePickerDone}
                      >
                        <Text style={styles.activeButtonText}>{copy.done}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })}
            <View style={styles.actionRow}>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={importBusy}
                onPress={cancelImport}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>{copy.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={importBusy}
                onPress={() => void confirmImport()}
                style={styles.activeButton}
              >
                <Text style={styles.activeButtonText}>
                  {importBusy ? copy.loading : copy.importClasses}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {pendingDelete ? (
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{copy.deleteConfirmTitle}</Text>
            <Text style={styles.confirmMessage}>{pendingDelete.name}</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setPendingDelete(null)}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>{copy.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => void removeClass()}
                style={styles.activeButton}
              >
                <Text style={styles.activeButtonText}>{copy.delete}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {formOpen ? (
          <View style={styles.formCard}>
            {field(
              copy.className,
              draft.name,
              (name) => setDraft({ ...draft, name }),
              copy.className,
            )}
            {field(
              copy.building,
              draft.building,
              (building) => setDraft({ ...draft, building }),
              copy.building,
            )}
            {field(
              copy.room,
              draft.room,
              (room) => setDraft({ ...draft, room }),
              copy.room,
            )}

            <View style={styles.field}>
              <Text style={styles.label}>{copy.day}</Text>
              <View style={styles.optionList}>
                {weekdays.map((day) => {
                  const selected = draft.dayOfWeek === day;
                  return (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={day}
                      onPress={() => setDraft({ ...draft, dayOfWeek: day })}
                      style={[styles.option, selected && styles.activeOption]}
                    >
                      <Text style={[styles.optionText, selected && styles.activeOptionText]}>
                        {copy[day]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {field(
              copy.startTime,
              draft.startTime,
              (startTime) => setDraft({ ...draft, startTime }),
              '09:30',
              'numbers-and-punctuation',
            )}

            {validationMessage ? (
              <Text accessibilityRole="alert" style={styles.helperText}>
                {validationMessage}
              </Text>
            ) : null}

            <View style={styles.actionRow}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setFormOpen(false)}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>{copy.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void submitForm()}
                style={styles.activeButton}
              >
                <Text style={styles.activeButtonText}>
                  {saving ? copy.loading : copy.save}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : classes.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{copy.noClassesMessage}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={openNewForm}
              style={styles.activeButton}
            >
              <Text style={styles.activeButtonText}>{copy.addClass}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.listCard}>
            {classes.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.classRow,
                  index % 2 === 0 && styles.classRowAlternate,
                ]}
              >
                <View style={styles.classInfo}>
                  <Text style={styles.className}>{item.name}</Text>
                  <Text style={styles.details}>
                    {copy[item.dayOfWeek]} · {item.startTime} · {item.building}, {copy.room} {item.room}
                  </Text>
                  <Text style={styles.details}>
                    {copy[modeLabels[item.transportMode]]}
                  </Text>
                </View>
                <TouchableOpacity
                  accessibilityLabel={`${copy.edit}: ${item.name}`}
                  accessibilityRole="button"
                  onPress={() => openEditForm(item)}
                  style={styles.iconButton}
                >
                  <Pencil color={colors.textPrimary} size={tokens.icon.size} strokeWidth={tokens.icon.strokeWidth} />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel={`${copy.delete}: ${item.name}`}
                  accessibilityRole="button"
                  onPress={() => setPendingDelete(item)}
                  style={styles.iconButton}
                >
                  <Trash2 color={colors.textSecondary} size={tokens.icon.size} strokeWidth={tokens.icon.strokeWidth} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[4],
    paddingTop: tokens.spacing[4],
    paddingBottom: tokens.layout.tabBarClearance,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: tokens.icon.touchTarget + tokens.spacing[2],
    marginBottom: tokens.spacing[2],
    paddingTop: 10,
  },
  headerCopy: {
    flex: 1,
    gap: tokens.spacing[1],
  },
  headerActions: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
  },
  title: {
    color: colors.textPrimary,
    fontFamily: tokens.type.familyBold,
    fontSize: tokens.type.size.title,
    lineHeight: tokens.type.lineHeight.title,
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontFamily: tokens.type.family,
    fontSize: tokens.type.size.caption,
    lineHeight: tokens.type.lineHeight.caption,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.cardInner,
    borderRadius: tokens.radius.circle,
    height: tokens.icon.touchTarget,
    justifyContent: 'center',
    width: tokens.icon.touchTarget,
  },
  formCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: tokens.radius.card,
    borderWidth: tokens.border.width,
    gap: tokens.spacing[4],
    padding: tokens.spacing[4],
  },
  field: {
    gap: tokens.spacing[2],
  },
  label: {
    color: colors.textPrimary,
    fontFamily: tokens.type.familyBold,
    fontSize: tokens.type.size.body,
    lineHeight: tokens.type.lineHeight.body,
  },
  input: {
    backgroundColor: colors.cardInner,
    borderColor: colors.border,
    borderRadius: tokens.radius.field,
    borderWidth: tokens.border.width,
    color: colors.textPrimary,
    fontFamily: tokens.type.family,
    fontSize: tokens.type.size.body,
    fontVariant: tokens.type.tabularNums,
    minHeight: tokens.icon.touchTarget,
    paddingHorizontal: tokens.spacing[3],
  },
  timePickerButton: {
    alignItems: 'center',
    backgroundColor: colors.cardInner,
    borderColor: colors.border,
    borderRadius: tokens.radius.field,
    borderWidth: tokens.border.width,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: tokens.icon.touchTarget,
    paddingHorizontal: tokens.spacing[3],
  },
  timePickerText: {
    color: colors.textPrimary,
    fontFamily: tokens.type.family,
    fontSize: tokens.type.size.body,
    fontVariant: tokens.type.tabularNums,
    lineHeight: tokens.type.lineHeight.body,
  },
  timePickerPlaceholder: {
    color: colors.textSecondary,
  },
  iosTimePicker: {
    backgroundColor: colors.cardInner,
    borderRadius: tokens.radius.field,
    padding: tokens.spacing[2],
  },
  timePickerDone: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: colors.activeBg,
    borderRadius: tokens.radius.pill,
    justifyContent: 'center',
    minHeight: tokens.icon.touchTarget,
    paddingHorizontal: tokens.spacing[4],
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
    paddingHorizontal: tokens.spacing[3],
  },
  activeOption: {
    backgroundColor: colors.activeBg,
  },
  optionText: {
    color: colors.textPrimary,
    fontFamily: tokens.type.family,
    fontSize: tokens.type.size.caption,
    lineHeight: tokens.type.lineHeight.caption,
  },
  activeOptionText: {
    color: colors.activeText,
    fontFamily: tokens.type.familyBold,
  },
  helperText: {
    color: colors.textSecondary,
    fontFamily: tokens.type.family,
    fontSize: tokens.type.size.body,
    lineHeight: tokens.type.lineHeight.body,
  },
  actionRow: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
    marginTop: tokens.spacing[2],
  },
  activeButton: {
    alignItems: 'center',
    backgroundColor: colors.activeBg,
    borderRadius: tokens.radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: tokens.icon.touchTarget,
    paddingHorizontal: tokens.spacing[4],
  },
  activeButtonText: {
    color: colors.activeText,
    fontFamily: tokens.type.familyBold,
    fontSize: tokens.type.size.body,
    lineHeight: tokens.type.lineHeight.body,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.cardInner,
    borderRadius: tokens.radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: tokens.icon.touchTarget,
    paddingHorizontal: tokens.spacing[4],
  },
  buttonText: {
    color: colors.textPrimary,
    fontFamily: tokens.type.family,
    fontSize: tokens.type.size.body,
    lineHeight: tokens.type.lineHeight.body,
  },
  emptyCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: tokens.radius.card,
    borderWidth: tokens.border.width,
    gap: tokens.spacing[4],
    padding: tokens.spacing[5],
  },
  emptyText: {
    color: colors.textSecondary,
    fontFamily: tokens.type.family,
    fontSize: tokens.type.size.body,
    lineHeight: tokens.type.lineHeight.body,
  },
  listCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: tokens.radius.card,
    borderWidth: tokens.border.width,
    gap: tokens.spacing[2],
    padding: tokens.spacing[3],
  },
  classRow: {
    alignItems: 'center',
    borderRadius: tokens.radius.field,
    flexDirection: 'row',
    gap: tokens.spacing[1],
    minHeight: tokens.icon.touchTarget + tokens.spacing[4],
    paddingHorizontal: tokens.spacing[2],
    paddingVertical: tokens.spacing[2],
  },
  classRowAlternate: {
    backgroundColor: colors.cardInner,
  },
  classInfo: {
    flex: 1,
    gap: tokens.spacing[1],
    minWidth: tokens.spacing[0],
  },
  className: {
    color: colors.textPrimary,
    fontFamily: tokens.type.familyBold,
    fontSize: tokens.type.size.body,
    lineHeight: tokens.type.lineHeight.body,
  },
  details: {
    color: colors.textSecondary,
    fontFamily: tokens.type.family,
    fontSize: tokens.type.size.caption,
    lineHeight: tokens.type.lineHeight.caption,
    fontVariant: tokens.type.tabularNums,
  },
  confirmCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: tokens.radius.card,
    borderWidth: tokens.border.width,
    gap: tokens.spacing[3],
    padding: tokens.spacing[4],
  },
  confirmTitle: {
    color: colors.textPrimary,
    fontFamily: tokens.type.familyBold,
    fontSize: tokens.type.size.bodyLarge,
    lineHeight: tokens.type.lineHeight.bodyLarge,
  },
  confirmMessage: {
    color: colors.textSecondary,
    fontFamily: tokens.type.family,
    fontSize: tokens.type.size.body,
    lineHeight: tokens.type.lineHeight.body,
  },
  });
}

function decodeBase64(value: string): Uint8Array {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const normalized = value.replace(/\s/g, '');
  const bytes = new Uint8Array(Math.floor((normalized.length * 3) / 4));
  let byteIndex = 0;
  let accumulator = 0;
  let bitCount = 0;

  for (const character of normalized) {
    if (character === '=') {
      break;
    }
    const digit = alphabet.indexOf(character);
    if (digit === -1) {
      throw new Error('The selected PDF data is invalid.');
    }
    accumulator = (accumulator << 6) | digit;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[byteIndex] = (accumulator >> bitCount) & 0xff;
      byteIndex += 1;
    }
  }
  return bytes.subarray(0, byteIndex);
}

function dateFromTime(value: string): Date {
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
