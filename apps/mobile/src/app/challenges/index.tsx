import { useQuery } from '@tanstack/react-query';
import type { ChallengeDto } from '@fitness/contracts';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OfflineBanner } from '@/components/offline-banner';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiRequestError } from '@/lib/api';
import { listChallenges } from '@/lib/challenges';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** Elapsed-time progress across the challenge window, clamped to [0, 1]. */
function timeProgress(challenge: ChallengeDto): number {
  const start = Date.parse(challenge.startDate);
  const end = Date.parse(challenge.endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
}

const STATUS_LABEL: Record<ChallengeDto['status'], string> = {
  pending: 'Upcoming',
  active: 'Active',
  ended: 'Ended',
};

function ChallengeCard({ challenge }: { challenge: ChallengeDto }) {
  const theme = useTheme();
  const progress = timeProgress(challenge);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardTopRow}>
        <ThemedText type="smallBold" themeColor="accent" style={styles.typeBadge}>
          {challenge.type.toUpperCase()}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {STATUS_LABEL[challenge.status]} · {challenge.memberCount}{' '}
          {challenge.memberCount === 1 ? 'member' : 'members'}
        </ThemedText>
      </View>
      <ThemedText type="default" style={styles.cardName} numberOfLines={2}>
        {challenge.name}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {formatDay(challenge.startDate)} → {formatDay(challenge.endDate)}
      </ThemedText>
      {challenge.status === 'active' ? (
        <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.progressFill, { backgroundColor: theme.accent, flex: progress }]} />
          <View style={{ flex: 1 - progress }} />
        </View>
      ) : null}
    </ThemedView>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return 'Something went wrong while loading your challenges.';
}

export default function ChallengesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { data, isPending, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['challenges'],
    queryFn: listChallenges,
  });

  const renderItem = useCallback(
    ({ item }: { item: ChallengeDto }) => <ChallengeCard challenge={item} />,
    [],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="My Challenges" />
        <OfflineBanner onRetry={() => void refetch()} retrying={isRefetching} />

        {isPending ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.accent} size="large" />
            <ThemedText type="small" themeColor="textSecondary">
              Loading your challenges…
            </ThemedText>
          </View>
        ) : isError ? (
          <View style={styles.centered}>
            <ThemedText type="default" style={styles.errorTitle}>
              Couldn’t load challenges
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.errorBody}>
              {errorMessage(error)}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => void refetch()}
              style={({ pressed }) => [styles.retryLink, { opacity: pressed ? 0.6 : 1 }]}>
              <ThemedText type="smallBold" themeColor="accent">
                Try again
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.centered}>
                <ThemedText type="default" style={styles.errorTitle}>
                  No challenges yet
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.errorBody}>
                  Create your first challenge and invite your friends to compete on daily steps.
                </ThemedText>
              </View>
            }
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={() => void refetch()}
                tintColor={theme.accent}
              />
            }
          />
        )}

        <PrimaryButton label="New challenge" onPress={() => router.push('/challenges/new')} />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/challenges/join')}
          style={({ pressed }) => [styles.joinLink, { opacity: pressed ? 0.6 : 1 }]}>
          <ThemedText type="smallBold" themeColor="accent">
            Join with an invite code
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.three,
    maxWidth: 800,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 700,
    textAlign: 'center',
  },
  errorBody: {
    textAlign: 'center',
  },
  retryLink: {
    padding: Spacing.two,
  },
  listContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
    flexGrow: 1,
  },
  joinLink: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    fontSize: 12,
    letterSpacing: 1,
  },
  cardName: {
    fontSize: 18,
    fontWeight: 700,
  },
  progressTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: Spacing.one,
  },
  progressFill: {
    borderRadius: 3,
  },
});
