import {
  Bus,
  CarFront,
  CarTaxiFront,
  Clock3,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Footprints,
  MapPin,
  Plus,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ImageBackground,
  Platform,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text } from '../components/AppText';
import { CommuteHeroArt } from '../components/CommuteHeroArt';
import type { Translation } from '../i18n';
import { homeBackgrounds } from '../theme/homeBackgrounds';
import { tokens } from '../theme/tokens';
import type { ThemeColors } from '../theme/tokens';
import type { Class, DayOfWeek, Settings, TransportMode } from '../types';
import { getCurrentWeather } from '../services/weather';
import type { CurrentWeather, WeatherCondition } from '../services/weather';
import {
  CommuteError,
  getTravelDurationSeconds,
  GeocodingNotFoundError,
  InvalidCoordinatesError,
  InvalidDestinationError,
  LinkParseError,
  LocationPermissionError,
  LocationUnavailableError,
  NoRouteError,
  UnsupportedTransportModeError,
  type TransportMode as EstimateTransportMode,
} from '../services/commute';
import { openTrafficMap } from '../services/traffic';
import { getNextClass } from '../utils/nextClass';

type Copy = Translation;

interface HomeScreenProps {
  classes: Class[];
  settings: Settings;
  schoolAddress: string;
  copy: Copy;
  colors: ThemeColors;
  onAddClass: () => void;
  onSelectTransport: (mode: TransportMode) => Promise<void>;
}

const jsDays: DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const transportOptions: {
  mode: TransportMode;
  label: keyof Copy;
  Icon: typeof Bus;
}[] = [
  { mode: 'walk', label: 'walk', Icon: Footprints },
  { mode: 'bus', label: 'bus', Icon: Bus },
  { mode: 'car', label: 'car', Icon: CarFront },
  { mode: 'taxi', label: 'taxi', Icon: CarTaxiFront },
];

const weatherIcons: Record<WeatherCondition, typeof CloudSun> = {
  clear: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  snow: CloudSnow,
  thunderstorm: CloudLightning,
  unknown: CloudSun,
};

const weatherCopyKeys: Record<WeatherCondition, keyof Copy> = {
  clear: 'weatherClear',
  cloudy: 'weatherCloudy',
  fog: 'weatherFog',
  rain: 'weatherRain',
  snow: 'weatherSnow',
  thunderstorm: 'weatherThunderstorm',
  unknown: 'weatherUnknown',
};

const estimateTransportModes: Record<TransportMode, EstimateTransportMode> = {
  walk: 'Walk',
  bus: 'Bus',
  car: 'Car',
  taxi: 'Taxi',
};

function estimateErrorCopyKey(error: unknown): keyof Copy {
  if (!(error instanceof CommuteError)) {
    return 'estimateUnavailable';
  }
  if (error instanceof UnsupportedTransportModeError) {
    return 'estimateTransitUnavailable';
  }
  if (error instanceof LocationPermissionError || error instanceof LocationUnavailableError) {
    return 'estimateLocationUnavailable';
  }
  if (error instanceof LinkParseError || error instanceof InvalidDestinationError || error instanceof InvalidCoordinatesError) {
    return 'estimateSchoolLocationInvalid';
  }
  if (error.category === 'link') {
    return 'estimateSchoolLinkUnavailable';
  }
  if (error.category === 'geocoding') {
    return error instanceof GeocodingNotFoundError
      ? 'estimateSchoolLocationNotFound'
      : 'estimateGeocodingUnavailable';
  }
  if (error.category === 'routing') {
    return error instanceof NoRouteError
      ? 'estimateRouteUnavailable'
      : 'estimateRoutingUnavailable';
  }
  return 'estimateUnavailable';
}

export function HomeScreen({
  classes,
  settings,
  schoolAddress,
  copy,
  colors,
  onAddClass,
  onSelectTransport,
}: HomeScreenProps) {
  const homeBackground = homeBackgrounds[settings.homeBackgroundId];
  const photoText = homeBackground.tone
    ? tokens.photoText[homeBackground.tone]
    : null;
  const styles = useMemo(
    () => createStyles(colors, photoText),
    [colors, photoText],
  );
  const [weekView, setWeekView] = useState(false);
  const [modeError, setModeError] = useState(false);
  const [trafficError, setTrafficError] = useState(false);
  const [routeDurationSeconds, setRouteDurationSeconds] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<keyof Copy | null>(null);
  const [estimateAttempt, setEstimateAttempt] = useState(0);
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [weatherUnavailable, setWeatherUnavailable] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const greetingSurfaceOpacity = scrollY.interpolate({
    inputRange: [0, tokens.layout.headerFadeInDistance],
    outputRange: [0, tokens.opacity.headerScrolled],
    extrapolate: 'clamp',
  });
  const upcoming = getNextClass(classes);
  const transportMode =
    upcoming?.classItem.transportMode ?? settings.defaultTransportMode;
  const estimatedLeaveBy =
    upcoming && routeDurationSeconds !== null
      ? formatClockTime(
          new Date(
            upcoming.startsAt.getTime() -
              (routeDurationSeconds + settings.bufferMinutes * 60) * 1000,
          ),
        )
      : '--:--';
  const estimateMessage = estimateError
    ? copy[estimateError]
    : routeDurationSeconds !== null
      ? copy.estimateTravelTime
          .replace(
            '{duration}',
            String(Math.ceil(routeDurationSeconds / 60)),
          )
          .replace('{buffer}', String(settings.bufferMinutes))
      : isEstimating
        ? copy.leaveByPending
        : copy.estimateNoUpcomingClass;
  const canRetryEstimate =
    estimateError !== null &&
    estimateError !== 'estimateSchoolLocationInvalid' &&
    estimateError !== 'estimateSchoolLocationNotFound' &&
    estimateError !== 'estimateTransitUnavailable';
  const today = jsDays[new Date().getDay()];
  const visibleClasses = useMemo(() => {
    const filtered = weekView
      ? [...classes]
      : classes.filter((item) => item.dayOfWeek === today);

    return filtered.sort((first, second) =>
      first.dayOfWeek === second.dayOfWeek
        ? first.startTime.localeCompare(second.startTime)
        : jsDays.indexOf(first.dayOfWeek) - jsDays.indexOf(second.dayOfWeek),
    );
  }, [classes, today, weekView]);
  const WeatherIcon = weather
    ? weatherIcons[weather.condition]
    : CloudSun;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentHour(new Date().getHours());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    getCurrentWeather()
      .then((currentWeather) => {
        if (active) {
          setWeather(currentWeather);
        }
      })
      .catch(() => {
        if (active) {
          setWeatherUnavailable(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!upcoming || !schoolAddress.trim()) {
      setRouteDurationSeconds(null);
      setEstimateError(null);
      setIsEstimating(false);
      return () => {
        active = false;
      };
    }

    setRouteDurationSeconds(null);
    setEstimateError(null);
    setIsEstimating(true);
    getTravelDurationSeconds(
      schoolAddress.trim(),
      estimateTransportModes[transportMode],
    )
      .then((durationSeconds) => {
        if (active) {
          setRouteDurationSeconds(durationSeconds);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setEstimateError(estimateErrorCopyKey(error));
        }
      })
      .finally(() => {
        if (active) {
          setIsEstimating(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    estimateAttempt,
    schoolAddress,
    transportMode,
    upcoming?.classItem.id,
    upcoming?.startsAt.getTime(),
  ]);

  const changeTransport = async (mode: TransportMode) => {
    setModeError(false);
    try {
      await onSelectTransport(mode);
    } catch {
      setModeError(true);
    }
  };

  const viewTraffic = async () => {
    setTrafficError(false);
    try {
      await openTrafficMap();
    } catch {
      setTrafficError(true);
    }
  };

  return (
    <View style={styles.screen}>
      {homeBackground.source ? (
        <ImageBackground
          imageStyle={styles.backgroundImage}
          pointerEvents="none"
          resizeMode="cover"
          source={homeBackground.source}
          style={[StyleSheet.absoluteFill, styles.pageBackground]}
        />
      ) : (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.pageBackground]}
        />
      )}

      <Animated.ScrollView
        contentContainerStyle={styles.container}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={tokens.animation.scrollEventThrottle}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
        style={styles.screenScroll}
      >
        <View style={styles.greetingRow}>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.greetingSurface,
              { opacity: greetingSurfaceOpacity },
            ]}
          />
          <View style={styles.greetingCopy}>
            <Text style={styles.greeting}>
              {currentHour < 12 ? copy.goodMorning : copy.goodEvening}
            </Text>
            <Text style={styles.subGreeting}>{copy.tagline}</Text>
          </View>
          <View
            accessible
            accessibilityLabel={
              weather
                ? `${Math.round(weather.temperatureCelsius)}°, ${copy[weatherCopyKeys[weather.condition]]}`
                : weatherUnavailable
                  ? copy.weatherUnavailable
                  : copy.weatherLoading
            }
            style={styles.weatherInsight}
          >
            <View style={styles.weatherSummary}>
              <WeatherIcon
                color={photoText?.primary ?? colors.textPrimary}
                size={tokens.icon.size}
                strokeWidth={tokens.icon.strokeWidth}
              />
              {weather ? (
                <Text style={styles.weatherTemperature}>
                  {Math.round(weather.temperatureCelsius)}°
                </Text>
              ) : null}
            </View>
            <Text numberOfLines={1} style={styles.weatherCondition}>
              {weather
                ? copy[weatherCopyKeys[weather.condition]]
                : weatherUnavailable
                  ? copy.weatherUnavailable
                  : copy.weatherLoading}
            </Text>
            <Text style={styles.weatherAttribution}>
              {copy.weatherAttribution}
            </Text>
          </View>
        </View>

        <View style={styles.hero}>
          {!homeBackground.source ? (
            <CommuteHeroArt colors={colors} />
          ) : null}
          <View style={styles.heroContent}>
            <View style={styles.nextClassOverlay}>
              <View style={styles.nextClassHeading}>
                <Text style={styles.sectionLabel}>{copy.nextClass}</Text>
                {upcoming ? (
                  <View style={styles.classTime}>
                    <View style={styles.smallIconCircle}>
                      <Clock3
                        color={colors.textSecondary}
                        size={tokens.type.size.caption}
                        strokeWidth={tokens.icon.strokeWidth}
                      />
                    </View>
                    <Text style={styles.classTimeText}>
                      {upcoming.classItem.startTime}
                    </Text>
                  </View>
                ) : null}
              </View>

              {upcoming ? (
                <>
                  <Text style={styles.className}>{upcoming.classItem.name}</Text>
                  <View style={styles.locationLine}>
                    <View style={styles.smallIconCircle}>
                      <MapPin
                        color={colors.textSecondary}
                        size={tokens.type.size.caption}
                        strokeWidth={tokens.icon.strokeWidth}
                      />
                    </View>
                    <Text style={styles.destinationText}>
                      {upcoming.classItem.building} · {copy.room}{' '}
                      {upcoming.classItem.room}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.emptyClass}>
                  <Text style={styles.className}>{copy.noClassesTitle}</Text>
                  <Text style={styles.destinationText}>
                    {copy.noClassesMessage}
                  </Text>
                </View>
              )}

              <View style={styles.leaveByGroup}>
                <View style={styles.leaveByTimeRow}>
                  <Text style={styles.leaveByLabel}>{copy.leaveBy}</Text>
                  <Text style={styles.leaveByTime}>{estimatedLeaveBy}</Text>
                </View>
                <Text
                  accessibilityRole={estimateError ? 'alert' : undefined}
                  style={styles.leaveByHint}
                >
                  {estimateMessage}
                </Text>
                {routeDurationSeconds !== null ? (
                  <Text style={styles.leaveByHint}>
                    {copy.estimateAttribution}
                  </Text>
                ) : null}
                {canRetryEstimate ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => setEstimateAttempt((attempt) => attempt + 1)}
                  >
                    <Text style={styles.estimateRetry}>{copy.retry}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        <View
          accessibilityLabel={copy.transportMode}
          style={styles.transportPill}
        >
          {transportOptions.map(({ mode, label, Icon }) => {
            const selected = transportMode === mode;
            return (
              <TouchableOpacity
                accessibilityLabel={copy[label]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={mode}
                onPress={() => void changeTransport(mode)}
                style={styles.transportOption}
              >
                <View
                  style={[
                    styles.transportCircle,
                    selected && styles.selectedTransportCircle,
                  ]}
                >
                  <Icon
                    color={selected ? colors.activeText : colors.textPrimary}
                    size={tokens.icon.size}
                    strokeWidth={tokens.icon.strokeWidth}
                  />
                </View>
                <Text
                  style={[
                    styles.transportLabel,
                    selected && styles.selectedTransportLabel,
                  ]}
                >
                  {copy[label]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {modeError ? (
          <Text accessibilityRole="alert" style={styles.modeError}>
            {copy.saveError}
          </Text>
        ) : null}

        <View style={styles.lowerPanel}>
          <View style={styles.scheduleHeader}>
            <Text style={styles.scheduleTitle}>
              {weekView ? copy.weekClasses : copy.todayClasses}
            </Text>
            <View style={styles.segmented}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: !weekView }}
                onPress={() => setWeekView(false)}
                style={[styles.segment, !weekView && styles.activeSegment]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    !weekView && styles.activeSegmentText,
                  ]}
                >
                  {copy.today}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: weekView }}
                onPress={() => setWeekView(true)}
                style={[styles.segment, weekView && styles.activeSegment]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    weekView && styles.activeSegmentText,
                  ]}
                >
                  {copy.thisWeek}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.scheduleContent}>
            {visibleClasses.length > 0 ? (
              visibleClasses.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.classRow,
                    index % 2 === 0 && styles.classRowAlternate,
                  ]}
                >
                  <Text style={styles.rowTime}>{item.startTime}</Text>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    <Text style={styles.rowLocation}>
                      {weekView ? `${copy[item.dayOfWeek]} · ` : ''}
                      {item.building} · {copy.room} {item.room}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptySchedule}>
                <Text style={styles.noClassesText}>
                  {weekView ? copy.noClassesMessage : copy.noClassesToday}
                </Text>
                {classes.length === 0 ? (
                  <TouchableOpacity
                    accessibilityLabel={copy.addClass}
                    accessibilityRole="button"
                    onPress={onAddClass}
                    style={styles.smallAddButton}
                  >
                    <Plus
                      color={colors.textPrimary}
                      size={tokens.icon.size}
                      strokeWidth={tokens.icon.strokeWidth}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>

          <TouchableOpacity
            accessibilityLabel={copy.trafficView}
            accessibilityRole="button"
            onPress={() => void viewTraffic()}
            style={styles.trafficBanner}
          >
            <View style={styles.trafficIcon}>
              <CarFront
                color={colors.textPrimary}
                size={tokens.icon.size}
                strokeWidth={tokens.icon.strokeWidth}
              />
            </View>
            <View style={styles.trafficCopy}>
              <Text style={styles.trafficTitle}>{copy.trafficAlertTitle}</Text>
              <Text style={styles.trafficMessage}>
                {copy.trafficAlertMessage}
              </Text>
            </View>
          </TouchableOpacity>
          {trafficError ? (
            <Text accessibilityRole="alert" style={styles.trafficError}>
              {copy.trafficError}
            </Text>
          ) : null}
        </View>
      </Animated.ScrollView>
    </View>
  );
}

function createStyles(
  colors: ThemeColors,
  photoText: typeof tokens.photoText.dark | typeof tokens.photoText.light | null,
) {
  const primaryTextColor = photoText?.primary ?? colors.textPrimary;
  const secondaryTextColor = photoText?.secondary ?? colors.textSecondary;
  const photoTextEdge = photoText
    ? {
        textShadowColor: photoText.edge,
        textShadowOffset: tokens.effect.textEdgeOffset,
        textShadowRadius: tokens.effect.textEdgeRadius,
      }
    : {};

  return StyleSheet.create({
    screen: {
      flex: 1,
    },
    screenScroll: {
      flex: 1,
    },
    container: {
      flexGrow: 1,
      gap: tokens.spacing[3],
      paddingTop: tokens.spacing[2],
    },
    pageBackground: {
      backgroundColor: colors.background,
    },
    hero: {
      minHeight: tokens.layout.heroMinimum - tokens.layout.homeHeaderHeight,
      position: 'relative',
    },
    backgroundImage: {
      height: '100%',
      width: '100%',
    },
    heroContent: {
      flexGrow: 1,
      justifyContent: 'flex-end',
      paddingHorizontal: tokens.spacing[4],
      paddingTop: tokens.spacing[2],
      paddingBottom: tokens.spacing[4],
    },
    greetingRow: {
      alignItems: 'center',
      backgroundColor: 'transparent',
      flexDirection: 'row',
      gap: tokens.spacing[3],
      justifyContent: 'space-between',
      minHeight: tokens.layout.homeHeaderHeight - tokens.spacing[4],
      paddingHorizontal: tokens.spacing[4],
      position: 'relative',
      zIndex: tokens.layout.stickyHeaderZIndex,
      paddingTop:
        (Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0) +
        tokens.spacing[2],
      paddingBottom: tokens.layout.headerSloganPadding,
    },
    greetingSurface: {
      backgroundColor: colors.card,
      borderBottomColor: colors.border,
      borderBottomLeftRadius: tokens.radius.card,
      borderBottomRightRadius: tokens.radius.card,
      borderBottomWidth: tokens.border.width,
      borderLeftColor: colors.border,
      borderLeftWidth: tokens.border.width,
      left: -tokens.spacing[4],
      position: 'absolute',
      borderRightColor: colors.border,
      borderRightWidth: tokens.border.width,
      right: -tokens.spacing[4],
      top:
        -(
          (Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0) +
          tokens.spacing[2] * 2
        ),
    },
    greetingCopy: {
      flex: 1,
      gap: tokens.spacing[1],
      minWidth: 0,
      paddingRight: 112,
    },
    weatherInsight: {
      alignItems: 'flex-end',
      position: 'absolute',
      right: tokens.spacing[4],
      top: 0,
      width: 112,
    },
    weatherSummary: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: tokens.spacing[1],
    },
    weatherTemperature: {
      ...photoTextEdge,
      color: primaryTextColor,
      fontFamily: tokens.type.familyBold,
      fontSize: tokens.type.size.bodyLarge,
      lineHeight: tokens.type.lineHeight.bodyLarge,
      fontVariant: tokens.type.tabularNums,
    },
    weatherCondition: {
      ...photoTextEdge,
      color: secondaryTextColor,
      fontFamily: tokens.type.family,
      fontSize: tokens.type.size.caption,
      lineHeight: tokens.type.lineHeight.caption,
      textAlign: 'right',
    },
    weatherAttribution: {
      ...photoTextEdge,
      color: secondaryTextColor,
      fontFamily: tokens.type.family,
      fontSize: 9,
      lineHeight: 12,
    },
    greeting: {
      ...photoTextEdge,
      color: primaryTextColor,
      fontFamily: tokens.type.familyBold,
      fontSize: tokens.type.size.title,
      lineHeight: tokens.type.lineHeight.title,
    },
    subGreeting: {
      ...photoTextEdge,
      color: secondaryTextColor,
      fontFamily: tokens.type.family,
      fontSize: tokens.type.size.caption,
      lineHeight: tokens.type.lineHeight.caption,
      paddingBottom: tokens.layout.sloganTextBottomPadding,
    },
    nextClassOverlay: {
      gap: tokens.spacing[2],
    },
    nextClassHeading: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    sectionLabel: {
      ...photoTextEdge,
      color: secondaryTextColor,
      fontFamily: tokens.type.familyBold,
      fontSize: tokens.type.size.caption,
      lineHeight: tokens.type.lineHeight.caption,
      textTransform: 'uppercase',
    },
    classTime: {
      alignItems: 'center',
      backgroundColor: colors.cardInner,
      borderRadius: tokens.radius.pill,
      flexDirection: 'row',
      gap: tokens.spacing[1],
      paddingHorizontal: tokens.spacing[2],
      paddingVertical: tokens.spacing[1],
    },
    smallIconCircle: {
      alignItems: 'center',
      backgroundColor: colors.cardInner,
      borderRadius: tokens.radius.circle,
      height: tokens.icon.size + tokens.spacing[2],
      justifyContent: 'center',
      width: tokens.icon.size + tokens.spacing[2],
    },
    classTimeText: {
      color: colors.textPrimary,
      fontFamily: tokens.type.family,
      fontSize: tokens.type.size.caption,
      lineHeight: tokens.type.lineHeight.caption,
      fontVariant: tokens.type.tabularNums,
    },
    className: {
      ...photoTextEdge,
      color: primaryTextColor,
      fontFamily: tokens.type.familyBold,
      fontSize: tokens.type.size.title,
      lineHeight: tokens.type.lineHeight.title,
    },
    locationLine: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: tokens.spacing[1],
    },
    destinationText: {
      ...photoTextEdge,
      color: secondaryTextColor,
      flexShrink: 1,
      fontFamily: tokens.type.family,
      fontSize: tokens.type.size.body,
      lineHeight: tokens.type.lineHeight.body,
    },
    emptyClass: {
      gap: tokens.spacing[1],
    },
    leaveByGroup: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing[3],
      marginTop: tokens.spacing[1],
    },
    leaveByTimeRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: tokens.spacing[3],
    },
    leaveByLabel: {
      ...photoTextEdge,
      color: primaryTextColor,
      fontFamily: tokens.type.familyBold,
      fontSize: tokens.type.size.bodyLarge,
      lineHeight: tokens.type.lineHeight.bodyLarge,
    },
    leaveByTime: {
      ...photoTextEdge,
      color: primaryTextColor,
      fontFamily: tokens.type.familyBold,
      fontSize: tokens.type.size.display,
      lineHeight: tokens.type.lineHeight.display,
      fontVariant: tokens.type.tabularNums,
    },
    leaveByHint: {
      ...photoTextEdge,
      color: secondaryTextColor,
      fontFamily: tokens.type.family,
      fontSize: tokens.type.size.caption,
      lineHeight: tokens.type.lineHeight.caption,
    },
    estimateRetry: {
      color: colors.accent,
      fontFamily: tokens.type.familyBold,
      fontSize: tokens.type.size.caption,
      lineHeight: tokens.type.lineHeight.caption,
    },
    transportPill: {
      alignItems: 'center',
      alignSelf: 'stretch',
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: tokens.radius.pill,
      borderWidth: tokens.border.width,
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginHorizontal: tokens.spacing[4],
      minHeight: tokens.layout.transportControlHeight,
      paddingHorizontal: tokens.spacing[2],
      paddingVertical: tokens.spacing[1],
    },
    transportOption: {
      alignItems: 'center',
      flex: 1,
      gap: tokens.spacing[1],
      justifyContent: 'center',
      minHeight: tokens.icon.touchTarget + tokens.spacing[2],
    },
    transportCircle: {
      alignItems: 'center',
      backgroundColor: colors.cardInner,
      borderRadius: tokens.radius.circle,
      height: tokens.icon.touchTarget,
      justifyContent: 'center',
      width: tokens.icon.touchTarget,
    },
    selectedTransportCircle: {
      backgroundColor: colors.activeBg,
    },
    transportLabel: {
      color: colors.textSecondary,
      fontFamily: tokens.type.family,
      fontSize: tokens.type.size.caption,
      lineHeight: tokens.type.lineHeight.caption,
    },
    selectedTransportLabel: {
      color: colors.textPrimary,
      fontFamily: tokens.type.familyBold,
    },
    modeError: {
      color: colors.textSecondary,
      fontFamily: tokens.type.family,
      fontSize: tokens.type.size.caption,
      lineHeight: tokens.type.lineHeight.caption,
      paddingHorizontal: tokens.spacing[4],
    },
    lowerPanel: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderTopLeftRadius: tokens.radius.card,
      borderTopRightRadius: tokens.radius.card,
      borderTopWidth: tokens.border.width,
      borderLeftWidth: tokens.border.width,
      borderRightWidth: tokens.border.width,
      flexGrow: 1,
      gap: tokens.spacing[2],
      minHeight: tokens.layout.panelMinimum,
      paddingHorizontal: tokens.spacing[4],
      paddingTop: tokens.spacing[3],
      paddingBottom: tokens.layout.tabBarClearance + tokens.spacing[2],
    },
    scheduleHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: tokens.spacing[2],
      justifyContent: 'space-between',
    },
    scheduleTitle: {
      color: colors.textPrimary,
      flex: 1,
      fontFamily: tokens.type.familyBold,
      fontSize: tokens.type.size.bodyLarge,
      lineHeight: tokens.type.lineHeight.bodyLarge,
      minWidth: tokens.spacing[0],
    },
    segmented: {
      backgroundColor: colors.cardInner,
      borderRadius: tokens.radius.pill,
      flexDirection: 'row',
      padding: tokens.spacing[1],
    },
    segment: {
      alignItems: 'center',
      borderRadius: tokens.radius.pill,
      justifyContent: 'center',
      minHeight: tokens.icon.touchTarget,
      paddingHorizontal: tokens.spacing[2],
    },
    activeSegment: {
      backgroundColor: colors.activeBg,
    },
    segmentText: {
      color: colors.textSecondary,
      fontFamily: tokens.type.family,
      fontSize: tokens.type.size.caption,
      lineHeight: tokens.type.lineHeight.caption,
    },
    activeSegmentText: {
      color: colors.activeText,
      fontFamily: tokens.type.familyBold,
    },
    scheduleContent: {
      gap: tokens.spacing[1],
    },
    classRow: {
      alignItems: 'center',
      borderRadius: tokens.radius.field,
      flexDirection: 'row',
      gap: tokens.spacing[3],
      minHeight: tokens.icon.touchTarget + tokens.spacing[2],
      paddingHorizontal: tokens.spacing[3],
      paddingVertical: tokens.spacing[2],
    },
    classRowAlternate: {
      backgroundColor: colors.cardInner,
    },
    rowTime: {
      color: colors.textPrimary,
      fontFamily: tokens.type.familyBold,
      fontSize: tokens.type.size.body,
      lineHeight: tokens.type.lineHeight.body,
      fontVariant: tokens.type.tabularNums,
    },
    rowInfo: {
      flex: 1,
      gap: tokens.spacing[1],
      minWidth: tokens.spacing[0],
    },
    rowName: {
      color: colors.textPrimary,
      fontFamily: tokens.type.familyBold,
      fontSize: tokens.type.size.body,
      lineHeight: tokens.type.lineHeight.body,
    },
    rowLocation: {
      color: colors.textSecondary,
      fontFamily: tokens.type.family,
      fontSize: tokens.type.size.caption,
      lineHeight: tokens.type.lineHeight.caption,
    },
    emptySchedule: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: tokens.spacing[2],
      justifyContent: 'space-between',
      minHeight: tokens.layout.scheduleMinimum,
    },
    noClassesText: {
      color: colors.textSecondary,
      flex: 1,
      fontFamily: tokens.type.family,
      fontSize: tokens.type.size.body,
      lineHeight: tokens.type.lineHeight.body,
    },
    smallAddButton: {
      alignItems: 'center',
      backgroundColor: colors.cardInner,
      borderRadius: tokens.radius.circle,
      height: tokens.icon.touchTarget,
      justifyContent: 'center',
      width: tokens.icon.touchTarget,
    },
    trafficBanner: {
      alignItems: 'center',
      borderTopColor: colors.border,
      borderTopWidth: tokens.border.width,
      flexDirection: 'row',
      gap: tokens.spacing[3],
      paddingTop: tokens.spacing[2],
    },
    trafficIcon: {
      alignItems: 'center',
      backgroundColor: colors.cardInner,
      borderRadius: tokens.radius.circle,
      height: tokens.icon.touchTarget,
      justifyContent: 'center',
      width: tokens.icon.touchTarget,
    },
    trafficCopy: {
      flex: 1,
      gap: tokens.spacing[1],
    },
    trafficTitle: {
      color: colors.textPrimary,
      fontFamily: tokens.type.familyBold,
      fontSize: tokens.type.size.body,
      lineHeight: tokens.type.lineHeight.body,
    },
    trafficMessage: {
      color: colors.textSecondary,
      fontFamily: tokens.type.family,
      fontSize: tokens.type.size.caption,
      lineHeight: tokens.type.lineHeight.caption,
    },
    trafficError: {
      color: colors.warning,
      fontFamily: tokens.type.family,
      fontSize: tokens.type.size.caption,
      lineHeight: tokens.type.lineHeight.caption,
    },
  });
}

function formatClockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}
