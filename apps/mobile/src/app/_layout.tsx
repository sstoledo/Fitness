import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Providers } from '@/providers/query';
import { useAppStore } from '@/store/useAppStore';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const sessionStatus = useAppStore((state) => state.sessionStatus);
  const segments = useSegments();
  const router = useRouter();

  // Read the persisted token and validate (or restore offline) the session.
  useEffect(() => {
    void useAppStore.getState().bootstrapSession();
  }, []);

  // Auth gate: unauthenticated users are routed to login; authenticated
  // users are pushed out of the (auth) group into the tabs.
  useEffect(() => {
    if (sessionStatus === 'unknown' || sessionStatus === 'restoring') return;

    const inAuthGroup = segments[0] === '(auth)';
    if (sessionStatus === 'unauthenticated' && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (sessionStatus === 'authenticated' && inAuthGroup) {
      router.replace('/');
    }
  }, [sessionStatus, segments, router]);

  // Keep the splash overlay while the stored session is being resolved so
  // the user never sees the wrong screen flash before the redirect.
  const isSessionResolved = sessionStatus !== 'unknown' && sessionStatus !== 'restoring';

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Providers>
        <AnimatedSplashOverlay />
        {isSessionResolved ? (
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="challenges" />
          </Stack>
        ) : null}
      </Providers>
    </ThemeProvider>
  );
}
