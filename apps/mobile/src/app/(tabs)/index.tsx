import { useQuery } from '@tanstack/react-query';
import * as Device from 'expo-device';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { HintRow } from '@/components/hint-row';
import { OfflineBanner } from '@/components/offline-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { API_URL } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';

function getDevMenuHint() {
  if (Platform.OS === 'web') {
    return <ThemedText type="small">use browser devtools</ThemedText>;
  }
  if (Device.isDevice) {
    return (
      <ThemedText type="small">
        shake device or press <ThemedText type="code">m</ThemedText> in terminal
      </ThemedText>
    );
  }
  const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
  return (
    <ThemedText type="small">
      press <ThemedText type="code">{shortcut}</ThemedText>
    </ThemedText>
  );
}

function useApiHealth() {
  return useQuery({
    queryKey: ['api-health'],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/health`);
      if (!response.ok) {
        throw new Error(`health check failed: ${response.status}`);
      }
      return (await response.json()) as { status: string; db: string };
    },
    retry: 1,
    refetchInterval: 30_000,
  });
}

function ApiStatusRow() {
  const { data, isPending, isError } = useApiHealth();

  let label: string;
  let color: string;
  if (isPending) {
    label = 'checking…';
    color = '#9CA3AF';
  } else if (isError || data?.status !== 'ok') {
    label = 'offline';
    color = '#DC2626';
  } else {
    label = 'online';
    color = '#16A34A';
  }

  return (
    <ThemedView type="backgroundElement" style={styles.apiRow}>
      <ThemedText type="code">API</ThemedText>
      <ThemedText type="code" style={{ color }}>
        {label}
      </ThemedText>
    </ThemedView>
  );
}

function SessionHeader() {
  const user = useAppStore((state) => state.user);
  const signOut = useAppStore((state) => state.signOut);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <ThemedView type="backgroundElement" style={styles.sessionRow}>
      <ThemedText type="smallBold" numberOfLines={1} style={styles.sessionGreeting}>
        Hey, {user?.name ?? 'Athlete'}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        disabled={signingOut}
        onPress={handleSignOut}
        style={({ pressed }) => [
          styles.logoutButton,
          { borderColor: '#9BA39B', opacity: signingOut || pressed ? 0.6 : 1 },
        ]}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {signingOut ? 'Signing out…' : 'Log out'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

export default function HomeScreen() {
  const sessionStatus = useAppStore((state) => state.sessionStatus);
  const validateSession = useAppStore((state) => state.validateSession);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <SessionHeader />
        <OfflineBanner
          onRetry={() => void validateSession()}
          retrying={sessionStatus === 'restoring'}
        />

        <ThemedView style={styles.heroSection}>
          <AnimatedIcon />
          <ThemedText type="title" style={styles.title}>
            Welcome to&nbsp;Fitness
          </ThemedText>
        </ThemedView>

        <ApiStatusRow />

        <ThemedText type="code" style={styles.code}>
          get started
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.stepContainer}>
          <HintRow
            title="Try editing"
            hint={<ThemedText type="code">src/app/index.tsx</ThemedText>}
          />
          <HintRow title="Dev tools" hint={getDevMenuHint()} />
          <HintRow
            title="Fresh start"
            hint={<ThemedText type="code">npm run reset-project</ThemedText>}
          />
        </ThemedView>

        {Platform.OS === 'web' && <WebBadge />}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  code: {
    textTransform: 'uppercase',
  },
  apiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    gap: Spacing.two,
  },
  sessionGreeting: {
    flexShrink: 1,
  },
  logoutButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
});