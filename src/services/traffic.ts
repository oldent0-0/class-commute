import { Linking } from 'react-native';

export async function openTrafficMap(): Promise<void> {
  await Linking.openURL('https://www.ubtraffic.mn');
}
