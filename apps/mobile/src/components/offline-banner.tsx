import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';

interface OfflineBannerProps {
  /**
   * Optional retry action (e.g. re-validating a restored session).
   * Omit on screens where the primary action — like submitting the auth
   * form — is the natural retry path.
   */
  onRetry?: () => void;
  retrying?: boolean;
}

/**
 * Shown whenever the last API call failed at the network level. Reads the
 * global offline flag set by apiFetch, so any screen that mounts it stays
 * in sync with the transport state without extra wiring.
 */
export function OfflineBanner({ onRetry, retrying = false }: OfflineBannerProps) {
  const offline = useAppStore((state) => state.offline);

  if (!offline) return null;

  return (
    <ThemedView type="backgroundSelected" style={styles.banner}>
      <ThemedText type="small" style={styles.text}>
        You are offline — the server is unreachable. Your session is kept; try again in a moment.
      </ThemedText>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          disabled={retrying}
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, { opacity: pressed ? 0.7 : 1 }]}>
          <ThemedText type="smallBold" themeColor="accent">
            {retrying ? 'Retrying…' : 'Retry'}
          </ThemedText>
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignSelf: 'stretch',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  text: {
    color: '#F2F4F0',
  },
  retry: {
    alignSelf: 'flex-start',
  },
});
