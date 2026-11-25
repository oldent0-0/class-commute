import * as Location from 'expo-location';

export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'fog'
  | 'rain'
  | 'snow'
  | 'thunderstorm'
  | 'unknown';

export interface CurrentWeather {
  temperatureCelsius: number;
  condition: WeatherCondition;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function conditionFromCode(code: number): WeatherCondition {
  if (code === 0) {
    return 'clear';
  }
  if (code >= 1 && code <= 3) {
    return 'cloudy';
  }
  if (code === 45 || code === 48) {
    return 'fog';
  }
  if (code >= 51 && code <= 67 || code >= 80 && code <= 82) {
    return 'rain';
  }
  if (code >= 71 && code <= 77 || code === 85 || code === 86) {
    return 'snow';
  }
  if (code >= 95 && code <= 99) {
    return 'thunderstorm';
  }
  return 'unknown';
}

export async function getCurrentWeather(): Promise<CurrentWeather> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Location permission was not granted.');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Low,
  });
  const { latitude, longitude } = position.coords;
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=celsius&timezone=auto`,
  );
  if (!response.ok) {
    throw new Error(`Weather request failed with status ${response.status}.`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !isRecord(payload.current)) {
    throw new Error('Weather response is missing current conditions.');
  }

  const temperature = payload.current.temperature_2m;
  const code = payload.current.weather_code;
  if (typeof temperature !== 'number' || typeof code !== 'number') {
    throw new Error('Weather response contains invalid current conditions.');
  }

  return {
    temperatureCelsius: temperature,
    condition: conditionFromCode(code),
  };
}
