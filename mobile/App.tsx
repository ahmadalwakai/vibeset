import * as Font from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NativeApp from './NativeApp';
import en from './messages/en.json';
import ar from './messages/ar.json';

export default function App(): ReactElement {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    Font.loadAsync({
      VibesetBody: require('./assets/fonts/ReadexPro.ttf'),
      VibesetDisplay: require('./assets/fonts/Fraunces.ttf'),
      VibesetArabicDisplay: require('./assets/fonts/ElMessiri.ttf'),
    }).then(
      () => {
        if (active) setStatus('ready');
      },
      () => {
        if (active) setStatus('error');
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {status === 'ready' ? (
        <NativeApp />
      ) : (
        <View style={styles.boot} accessibilityRole="summary">
          <Text style={styles.name}>vibeset</Text>
          {status === 'loading' ? (
            <>
              <ActivityIndicator
                color="#9734b1"
                accessibilityLabel={`${en.startup.loading} · ${ar.startup.loading}`}
              />
              <Text style={styles.copy}>
                {en.startup.loading} · {ar.startup.loading}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.copy}>
                {en.startup.fontError}
                {'\n'}
                {ar.startup.fontError}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setStatus('loading');
                  setAttempt((value) => value + 1);
                }}
                style={styles.retry}
              >
                <Text style={styles.retryText}>
                  {en.startup.retry} · {ar.startup.retry}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    padding: 24,
    backgroundColor: '#faf8fc',
  },
  name: { fontSize: 40, fontWeight: '700', color: '#16121d' },
  copy: { textAlign: 'center', color: '#665c76', fontSize: 16, lineHeight: 26 },
  retry: {
    minHeight: 44,
    minWidth: 160,
    borderRadius: 24,
    backgroundColor: '#9734b1',
    padding: 16,
    alignItems: 'center',
  },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
