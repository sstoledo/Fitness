import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiRequestError } from '@/lib/api';
import { getHealthProvider, type HealthPermissionStatus } from '@/lib/health';
import {
  getPendingStepBatch,
  retryPendingStepSync,
  syncTodaySteps,
  type StepSyncOutcome,
} from '@/lib/step-sync';

/**
 * Step sync card (Cut 1, task #10).
 *
 * Hosts the whole health-sync flow for one challenge: permission gate,
 * today's step count, upload with offline outbox, and the explanatory
 * empty state when permission is denied (step-challenges spec, "Permission
 * denied" scenario: explanation shown, no step data).
 *
 * Mounting: the challenge detail screen (task #12) renders
 * `<StepsSyncCard challengeId={id} />` and triggers `onSyncStateChange` on
 * pull-to-refresh alongside its own refetches.
 */

interface StepsSyncCardProps {
  challengeId: string;
  onSynced?: (steps: number) => void;
}

type CardPhase =
  | 'loading'
  | 'gate' // permission not granted yet — explain + request
  | 'denied' // user refused — explanatory empty state
  | 'unavailable' // no provider on this platform/device
  | 'ready'; // granted — steps + sync status

type SyncState = 'idle' | 'syncing' | 'synced' | 'pending' | 'error';

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return 'Something went wrong while syncing your steps.';
}

export function StepsSyncCard({ challengeId, onSynced }: StepsSyncCardProps) {
  const theme = useTheme();
  const [phase, setPhase] = useState<CardPhase>('loading');
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [steps, setSteps] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyOutcome = useCallback(
    (outcome: StepSyncOutcome): boolean => {
      switch (outcome.status) {
        case 'synced':
          setSyncState('synced');
          setSteps(outcome.steps);
          onSynced?.(outcome.steps);
          return true;
        case 'pending-sync':
          // Safe in the outbox — shown as "will sync when back online".
          setSyncState('pending');
          setSteps(outcome.steps);
          return true;
        case 'permission-denied':
          setPhase('denied');
          return false;
        case 'unavailable':
          setPhase('unavailable');
          return false;
      }
    },
    [onSynced],
  );

  const runSync = useCallback(async () => {
    setSyncState('syncing');
    setError(null);
    try {
      const outcome = await syncTodaySteps(challengeId);
      if (!applyOutcome(outcome)) return;
      setPhase('ready');
    } catch (syncError) {
      setSyncState('error');
      setError(errorMessage(syncError));
    }
  }, [challengeId, applyOutcome]);

  const requestPermission = useCallback(async () => {
    setSyncState('syncing');
    setError(null);
    const status: HealthPermissionStatus = await getHealthProvider().requestPermission();
    if (status === 'granted') {
      await runSync();
    } else if (status === 'denied') {
      // Refused (or still unanswered): switch to the explanatory empty state.
      setSyncState('idle');
      setPhase('denied');
    } else {
      setSyncState('idle');
      setPhase('unavailable');
    }
  }, [runSync]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const provider = getHealthProvider();
      const [status, pending] = await Promise.all([
        provider.getPermissionStatus(),
        getPendingStepBatch(),
      ]);
      if (cancelled) return;

      if (pending) {
        // A previous upload failed at the network level — retry it quietly
        // before syncing today's count again.
        try {
          await retryPendingStepSync();
        } catch {
          // Surface state is driven by the fresh sync below.
        }
        if (cancelled) return;
      }

      if (status === 'granted') {
        setPhase('ready');
        await runSync();
      } else if (status === 'denied') {
        // First mount with no grant: friendly connect gate. Only a refused
        // request switches to the stricter explanatory empty state.
        setPhase('gate');
      } else {
        setPhase('unavailable');
      }
    })().catch(() => {
      if (!cancelled) setPhase('unavailable');
    });

    return () => {
      cancelled = true;
    };
  }, [challengeId, runSync]);

  const syncing = syncState === 'syncing';

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {phase === 'loading' ? (
        <View style={styles.centeredRow}>
          <ActivityIndicator color={theme.accent} />
          <ThemedText type="small" themeColor="textSecondary">
            Checking health permissions…
          </ThemedText>
        </View>
      ) : null}

      {phase === 'gate' ? (
        <View style={styles.column}>
          <ThemedText type="default" style={styles.title}>
            Connect your health data
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
            Fitness reads your daily steps from Health Connect to score this challenge. Nothing
            is read until you allow it.
          </ThemedText>
          <PrimaryButton
            label="Connect Health Connect"
            onPress={() => void requestPermission()}
            loading={syncing}
          />
        </View>
      ) : null}

      {phase === 'denied' ? (
        <View style={styles.column}>
          <ThemedText type="default" style={styles.title}>
            Steps need health permission
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
            We can’t read your steps because health permission is off. Your friends’ progress
            still works — enable the permission to join the ranking with your own steps. No
            step data is shown or uploaded until you do.
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            disabled={syncing}
            onPress={() => void requestPermission()}
            style={({ pressed }) => [styles.retryLink, { opacity: pressed ? 0.6 : 1 }]}>
            <ThemedText type="smallBold" themeColor="accent">
              {syncing ? 'Asking…' : 'Allow access'}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {phase === 'unavailable' ? (
        <View style={styles.column}>
          <ThemedText type="default" style={styles.title}>
            Health data unavailable
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
            Step sync needs Health Connect on Android (iOS support is on the way). Install or
            update Health Connect on this device and try again.
          </ThemedText>
        </View>
      ) : null}

      {phase === 'ready' ? (
        <View style={styles.column}>
          <View style={styles.stepsRow}>
            <ThemedText type="title" themeColor="accent">
              {steps?.toLocaleString() ?? '—'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              steps today
            </ThemedText>
          </View>

          {syncState === 'synced' ? (
            <ThemedText type="small" themeColor="textSecondary">
              Synced with your challenge.
            </ThemedText>
          ) : null}
          {syncState === 'pending' ? (
            <ThemedText type="small" themeColor="textSecondary">
              You are offline — your steps are saved on this device and will sync automatically.
            </ThemedText>
          ) : null}
          {syncState === 'error' && error ? (
            <ThemedText type="small" style={styles.errorText}>
              {error}
            </ThemedText>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={syncing}
            onPress={() => void runSync()}
            style={({ pressed }) => [styles.retryLink, { opacity: pressed ? 0.6 : 1 }]}>
            <ThemedText type="smallBold" themeColor="accent">
              {syncing ? 'Syncing…' : 'Sync now'}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  column: {
    gap: Spacing.two,
  },
  centeredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
  },
  body: {
    lineHeight: 20,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  retryLink: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
  },
  errorText: {
    color: '#FF8A80',
  },
});
