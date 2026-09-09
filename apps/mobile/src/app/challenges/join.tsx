import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthFormField } from '@/components/auth-form-field';
import { OfflineBanner } from '@/components/offline-banner';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiRequestError } from '@/lib/api';
import { joinChallenge } from '@/lib/challenges';

/**
 * Join-by-invite screen (Cut 1, task #8).
 *
 * Opens from the deep link /challenges/join?challengeId=<id>&token=<inviteToken>
 * (deep-link handling lands in Cut 3 — for now the params come from an
 * in-app navigation) or manually from the challenge list when the user
 * types the invite code themselves. Confirming joins the challenge; on
 * success the ['challenges'] query is invalidated so the new challenge
 * shows up in the list, and the user is taken back to it.
 *
 * Backend endpoint does not exist yet (task #9): without the mock flag the
 * join fails and the error is surfaced here; with
 * EXPO_PUBLIC_USE_CHALLENGE_MOCKS=1 the join is simulated in memory (see
 * REMOVAL NOTE in lib/challenges.ts).
 */

function joinErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 403) {
      return 'This invite is not for your account. Ask the challenge creator for a new invite.';
    }
    if (error.status === 409) {
      return 'This challenge is full (20 members max).';
    }
    return error.message;
  }
  return 'Could not reach the server. Check your connection and try again.';
}

export default function JoinChallengeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ challengeId?: string; token?: string }>();

  const [challengeId, setChallengeId] = useState(typeof params.challengeId === 'string' ? params.challengeId : '');
  const [token, setToken] = useState(typeof params.token === 'string' ? params.token : '');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id, inviteToken }: { id: string; inviteToken: string }) => joinChallenge(id, inviteToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['challenges'] });
      router.replace('/challenges');
    },
  });

  const handleJoin = () => {
    const id = challengeId.trim();
    const inviteToken = token.trim();
    if (id.length === 0 || inviteToken.length === 0) {
      setFieldError('Enter the challenge code and the invite code you received.');
      return;
    }
    setFieldError(null);
    mutation.mutate({ id, inviteToken });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Join Challenge" />
        <OfflineBanner />

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <ThemedText type="default" style={styles.heading}>
            You’ve been invited to a challenge
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.bodyText}>
            Enter the challenge code and invite code from your invitation, then confirm to start
            competing on daily steps. The challenge will appear in your list right after joining.
          </ThemedText>

          <AuthFormField
            label="Challenge code"
            value={challengeId}
            onChangeText={(value) => {
              setChallengeId(value);
              setFieldError(null);
            }}
            placeholder="challenge id"
            autoCapitalize="none"
            error={undefined}
          />
          <AuthFormField
            label="Invite code"
            value={token}
            onChangeText={(value) => {
              setToken(value);
              setFieldError(null);
            }}
            placeholder="invite token"
            autoCapitalize="none"
            error={undefined}
          />

          {fieldError ? (
            <ThemedText type="small" style={styles.errorText}>
              {fieldError}
            </ThemedText>
          ) : null}
          {mutation.isError ? (
            <ThemedText type="small" style={styles.errorText}>
              {joinErrorMessage(mutation.error)}
            </ThemedText>
          ) : null}

          <View style={[styles.noteCard, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              Challenges are private and invite-only. If the challenge is full (20 members) or the
              invite was meant for someone else, you will not be able to join.
            </ThemedText>
          </View>
        </ScrollView>

        <PrimaryButton
          label="Join challenge"
          onPress={handleJoin}
          loading={mutation.isPending}
          disabled={mutation.isPending}
        />
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
  body: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  heading: {
    fontSize: 20,
    fontWeight: 700,
  },
  bodyText: {
    lineHeight: 20,
  },
  errorText: {
    color: '#F87171',
  },
  noteCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
});
